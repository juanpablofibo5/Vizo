import type { EjecutorSql } from '../catalogo/cargador.js'
import {
  prepararAltaCliente,
  prepararBeneficiario,
  requiereBeneficiario,
  type DatosAltaCliente,
  type DatosBeneficiario,
} from '../dominio/clientes.js'

/**
 * Alta de clientes.
 *
 * TODO OCURRE EN UNA TRANSACCIÓN: el cliente, sus beneficiarios y los eventos
 * de bitácora. Si algo falla, no queda un cliente sin su rastro ni un evento
 * sin su cliente. La bitácora es lo que se defiende en una visita; un
 * historial con huecos es peor que no tenerlo.
 *
 * REGLA DURA 3: en la bitácora solo van IDs opacos. Nombres, RFC y CURP se
 * quedan en `clientes_finales`, protegidos por RLS. Un evento de bitácora con
 * el RFC dentro convertiría el historial en una fuga de datos personales.
 */

export interface EjecutorTransaccional extends EjecutorSql {
  query(sql: string, parametros?: unknown[]): Promise<{ rows: unknown[] }>
}

export interface AltaClienteParams {
  tenantId: string
  datos: DatosAltaCliente
  /** Obligatorio para personas morales y fideicomisos. */
  beneficiarios?: DatosBeneficiario[] | undefined
  /** Usuario que captura. NULL solo en seeds. */
  actorId?: string | undefined
}

export interface ResultadoAlta {
  clienteId: string
  beneficiarioIds: string[]
  requiereRevisionIdentidad: boolean
}

export class FaltaBeneficiario extends Error {
  constructor(tipoPersona: string) {
    super(
      `Una persona ${tipoPersona} necesita al menos un beneficiario controlador, o la ` +
        'declaración de que no existe. Es obligación del Art. 18, no un campo opcional.',
    )
    this.name = 'FaltaBeneficiario'
  }
}

export async function altaCliente(
  db: EjecutorTransaccional,
  p: AltaClienteParams,
): Promise<ResultadoAlta> {
  // Se valida ANTES de abrir la transacción: no tiene sentido tocar la base
  // para descubrir que el RFC estaba mal.
  const cliente = prepararAltaCliente(p.datos)

  const beneficiarios = (p.beneficiarios ?? []).map(prepararBeneficiario)
  if (requiereBeneficiario(cliente.tipoPersona) && beneficiarios.length === 0) {
    throw new FaltaBeneficiario(cliente.tipoPersona)
  }

  await db.query('begin')
  try {
    const { rows } = await db.query(
      `insert into clientes_finales (
         tenant_id, tipo_persona, rfc, curp, nombre_o_razon_social,
         nombre_pila, apellido_paterno, apellido_materno,
         fecha_nacimiento_o_constitucion, nacionalidad, identidad_alterna,
         requiere_revision_identidad, created_by
       ) values ($1,$2::tipo_persona,$3,$4,$5,$6,$7,$8,$9::date,$10,$11::jsonb,$12,$13)
       returning id`,
      [
        p.tenantId,
        cliente.tipoPersona,
        cliente.rfc ?? null,
        cliente.curp ?? null,
        cliente.nombreORazonSocial,
        cliente.nombrePila ?? null,
        cliente.apellidoPaterno ?? null,
        cliente.apellidoMaterno ?? null,
        cliente.fechaNacimientoOConstitucion ?? null,
        cliente.nacionalidad ?? null,
        cliente.identidadAlterna === undefined ? null : JSON.stringify(cliente.identidadAlterna),
        cliente.requiereRevisionIdentidad,
        p.actorId ?? null,
      ],
    )
    const clienteId = (rows[0] as { id: string }).id

    // Sin RFC ni CURP, cómo se resolvió la identidad y con qué tipo de
    // documento. El número NO se registra: es dato personal.
    await registrarEvento(db, p, 'cliente.alta', clienteId, {
      tipo_persona: cliente.tipoPersona,
      identificado_por: cliente.rfc ? 'rfc' : cliente.curp ? 'curp' : 'identidad_alterna',
    })

    if (cliente.requiereRevisionIdentidad) {
      await registrarEvento(db, p, 'cliente.identidad_marcada', clienteId, {
        motivo: 'sin_rfc_ni_curp',
        tipo_doc: cliente.identidadAlterna?.tipo_doc ?? null,
      })
    }

    const beneficiarioIds: string[] = []
    for (const b of beneficiarios) {
      const r = await db.query(
        `insert into beneficiarios_controladores (
           tenant_id, cliente_id, nombre, rfc, curp,
           participacion_pct, control_por, es_declaracion
         ) values ($1,$2,$3,$4,$5,$6::numeric,$7::control_beneficiario,$8)
         returning id`,
        [
          p.tenantId,
          clienteId,
          b.nombre,
          b.rfc ?? null,
          b.curp ?? null,
          b.participacionPct ?? null,
          b.controlPor,
          b.esDeclaracion,
        ],
      )
      const id = (r.rows[0] as { id: string }).id
      beneficiarioIds.push(id)

      await registrarEvento(db, p, 'beneficiario.alta', id, {
        cliente_id: clienteId,
        control_por: b.controlPor,
        es_declaracion: b.esDeclaracion,
      })
    }

    await db.query('commit')
    return {
      clienteId,
      beneficiarioIds,
      requiereRevisionIdentidad: cliente.requiereRevisionIdentidad,
    }
  } catch (error) {
    await db.query('rollback')
    throw error
  }
}

async function registrarEvento(
  db: EjecutorSql,
  p: AltaClienteParams,
  evento: string,
  objetoId: string,
  datos: Record<string, unknown>,
): Promise<void> {
  await db.query('select app.bitacora_registrar($1,$2,$3,$4,$5::jsonb,$6)', [
    p.tenantId,
    evento,
    evento.split('.')[0],
    objetoId,
    JSON.stringify(datos),
    p.actorId ?? null,
  ])
}
