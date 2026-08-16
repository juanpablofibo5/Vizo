import Link from 'next/link'
import { Marco } from '../../../componentes/marco'
import { BotonAprobarExpediente } from './aprobar'
import { camposVigentes, historialDelExpediente } from '../../../../src/persistencia/expediente'
import { tamanoLegible } from '../../../../src/dominio/tamano'
import { Client } from 'pg'
import { obligadoDeSesion, sesionRequerida } from '../../../../src/supabase/sesion'
import type { Completitud } from '../../../../src/dominio/expediente'
import { abrir } from './acciones'
import { FormularioSubida } from './subir'
import { SeccionRevisionAnual } from './revision'
import { FormularioDatos, type CampoPendiente } from './datos'
import { camposCapturables } from '../../../../src/persistencia/datos-expediente'
import { hoyEnMexico } from '../../../../src/dominio/fechas'

export const dynamic = 'force-dynamic'

/** Los eventos, dichos como se los contarías a alguien. */
const EVENTOS: Record<string, string> = {
  'expediente.abierto': 'Se abrió el expediente',
  'expediente.completitud_evaluada': 'Se evaluó la completitud',
  'expediente.aprobado': 'Aprobado',
  'documento.alta': 'Se subió un documento',
  'manifiesto.generado': 'Se generó el manifiesto',
}

interface Documento {
  id: string
  campo: string
  hash_sha256: string
  tamano_bytes: string
  mime: string
  created_at: string
  reemplazado: boolean
}

export default async function Expediente({ params }: { params: Promise<{ id: string }> }) {
  const { id: clienteId } = await params
  const sesion = await sesionRequerida()
  const obligado = await obligadoDeSesion()

  const db = new Client({ connectionString: process.env['VIZO_DB_URL'] ?? '' })
  await db.connect()

  try {
    // La lectura corre como el usuario, igual que las escrituras: RLS decide
    // qué cliente y qué expediente existen para esta sesión.
    await db.query('begin')
    await db.query(
      `select set_config('request.jwt.claims',
         json_build_object('sub',$1::text,'role','authenticated',
           'app_metadata', json_build_object('tenant_id',$2::text,'rol',$3::text))::text, true)`,
      [sesion.usuarioId, sesion.tenantId, sesion.rol],
    )
    await db.query('set local role authenticated')

    const cli = await db.query(
      `select id, nombre_o_razon_social, tipo_persona::text as tipo_persona, rfc,
              relacion_negocios
         from clientes_finales where id = $1`,
      [clienteId],
    )
    if (cli.rows.length === 0) {
      return (
        <Marco obligado={obligado} perfil={sesion}>
          <p className="error">Este cliente no existe en tu obligado.</p>
        </Marco>
      )
    }
    const cliente = cli.rows[0] as {
      nombre_o_razon_social: string
      tipo_persona: string
      rfc: string | null
      relacion_negocios: boolean | null
    }

    const exp = await db.query(
      `select e.id, e.estatus::text as estatus, e.actividad_id, e.completitud,
              e.verificado_en::text as verificado_en,
              r.vence::text as vence
         from expedientes e
         left join expedientes_por_reverificar r on r.expediente_id = e.id
        where e.cliente_id = $1 order by e.version desc limit 1`,
      [clienteId],
    )

    if (exp.rows.length === 0) {
      const abrirEste = abrir.bind(null, clienteId)
      return (
        <Marco obligado={obligado} perfil={sesion}>
          <h1>{cliente.nombre_o_razon_social}</h1>
          <p className="sub">
            En Fracción V Bis se integra expediente de cada aportante, sin importar el monto.
          </p>
          <form action={abrirEste}>
            <button type="submit">Abrir expediente</button>
          </form>
        </Marco>
      )
    }

    const expediente = exp.rows[0] as {
      id: string
      estatus: string
      actividad_id: string
      completitud: Completitud | Record<string, never>
      verificado_en: string | null
      vence: string | null
    }

    /**
     * La completitud se LEE, no se recalcula aquí.
     *
     * El primer intento la recalculaba en la página con `calcularCompletitud`,
     * y salió mal de una forma instructiva: el SELECT de arriba traía cuatro
     * columnas del cliente, así que todo lo que no estuviera en esa lista
     * —nacionalidad, domicilio, fechas— se leía como ausente. La pantalla
     * mostraba "faltan 4 datos" sobre un cliente que sí los tenía. No reventó:
     * dio un número plausible y equivocado, que es el modo de falla de la
     * regla dura 6.
     *
     * Agregar columnas al SELECT lo habría tapado hasta la próxima columna
     * nueva. El arreglo es que el cálculo viva en UN solo lugar
     * (`recalcularCompletitud`, que usa `to_jsonb(c)` y por tanto la fila
     * completa) y que la pantalla muestre lo que quedó guardado.
     */
    const completitud = expediente.completitud as Completitud
    const evaluado = typeof completitud.estatus === 'string'

    const docs = await db.query(
      `select d.id, d.campo, d.hash_sha256, d.tamano_bytes::text, d.mime, d.created_at,
              exists (select 1 from documentos n where n.reemplaza_a = d.id) as reemplazado
         from documentos d
        where d.expediente_id = $1
        order by d.created_at desc`,
      [expediente.id],
    )
    // Las etiquetas salen del catálogo, no de los faltantes: un documento ya
    // presente dejó de ser faltante y se quedaría mostrando su clave cruda
    // (`acta_constitutiva`) en vez de su nombre.
    const etiquetasRows = await db.query(
      `select distinct campo, etiqueta from campos_expediente where actividad_id = $1`,
      [expediente.actividad_id],
    )
    // Los campos de captura que el catálogo declara para este expediente, y
    // los códigos del SAT de los que son de catálogo. Va DENTRO de la
    // transacción por la misma razón que el historial de abajo.
    const capturables = await camposCapturables(db, {
      actividadId: expediente.actividad_id,
      tipoPersona: cliente.tipo_persona,
      fecha: hoyEnMexico(),
    })
    // El catálogo vigente completo —documentos incluidos—, que es de donde sale
    // la regla de antigüedad. `camposCapturables` solo trae los de captura.
    const camposDelExpediente = await camposVigentes(
      db,
      expediente.actividad_id,
      cliente.tipo_persona,
      hoyEnMexico(),
    )
    const catalogosNecesarios = [
      ...new Set(capturables.flatMap((c) => (c.catalogo === undefined ? [] : [c.catalogo]))),
    ]
    const opcionesRows =
      catalogosNecesarios.length === 0
        ? { rows: [] }
        : await db.query(
            `select catalogo, codigo, descripcion from catalogos_sat
              where actividad_id = $1 and catalogo = any($2::text[])
                and daterange(vigente_desde, vigente_hasta, '[]') @> $3::date
              order by descripcion`,
            [expediente.actividad_id, catalogosNecesarios, hoyEnMexico()],
          )

    // DENTRO de la transacción, a propósito.
    //
    // Estaba después del `rollback` y reventaba con "permission denied for
    // table bitacora". No era un problema de permisos del catálogo: al
    // revertir, la sesión se cae y la conexión vuelve a ser `vizo_app`, que
    // NOINHERIT y sin asumir `authenticated` no puede leer nada. El error
    // apuntaba a la tabla y la causa era el límite de la transacción.
    const historial = await historialDelExpediente(db, {
      sesion: { usuarioId: sesion.usuarioId, tenantId: sesion.tenantId, rol: sesion.rol },
      expedienteId: expediente.id,
    })

    await db.query('rollback')

    const faltantes = evaluado ? completitud.faltantes : []
    const etiquetas = new Map(
      (etiquetasRows.rows as Array<{ campo: string; etiqueta: string }>).map((r) => [
        r.campo,
        r.etiqueta,
      ]),
    )
    // La regla de antigüedad sale del catálogo VIGENTE, no de los faltantes:
    // el faltante dice qué campo y por qué, y el catálogo dice cuántos meses.
    const antiguedadPorCampo = new Map(
      camposDelExpediente.flatMap((c) =>
        c.antiguedadMaximaMeses === undefined ? [] : [[c.campo, c.antiguedadMaximaMeses] as const],
      ),
    )
    const pendientesDocumentales = faltantes
      .filter((f) => f.tipoDato === 'documento')
      .map((f) => ({
        campo: f.campo,
        etiqueta: f.etiqueta,
        motivo: f.motivo,
        ...(antiguedadPorCampo.has(f.campo)
          ? { antiguedadMaximaMeses: antiguedadPorCampo.get(f.campo) }
          : {}),
      }))
    const faltantesDeDato = faltantes.filter((f) => f.tipoDato !== 'documento')

    // Lo que el formulario va a pintar: los faltantes que SÍ son capturables,
    // cada uno con las opciones de su catálogo si las necesita.
    const porCatalogo = new Map<string, Array<{ codigo: string; descripcion: string }>>()
    for (const o of opcionesRows.rows as Array<{
      catalogo: string
      codigo: string
      descripcion: string
    }>) {
      const lista = porCatalogo.get(o.catalogo) ?? []
      lista.push({ codigo: o.codigo, descripcion: o.descripcion })
      porCatalogo.set(o.catalogo, lista)
    }
    const capturablesPorCampo = new Map(capturables.map((c) => [c.campo, c]))
    const pendientesDeDato: CampoPendiente[] = faltantesDeDato.flatMap((f) => {
      const c = capturablesPorCampo.get(f.campo)
      if (c === undefined) return []
      return [
        {
          campo: c.campo,
          etiqueta: c.etiqueta,
          tipoDato: c.tipoDato,
          compuesto: c.compuesto,
          ...(c.catalogo === undefined ? {} : { opciones: porCatalogo.get(c.catalogo) ?? [] }),
        },
      ]
    })


    return (
      <Marco obligado={obligado} perfil={sesion}>
        <h1>{cliente.nombre_o_razon_social}</h1>
        <p className="sub">
          {cliente.tipo_persona === 'fisica' ? 'Persona física' : 'Persona moral'} ·{' '}
          {cliente.rfc ?? 'sin RFC'} ·{' '}
          <span className="chip">{evaluado ? completitud.estatus : 'sin evaluar'}</span>{' '}
          {evaluado
            ? `${completitud.cubiertos} de ${completitud.totalObligatorios} requisitos`
            : 'la completitud aún no se ha calculado'}
        </p>

        {/*
          DOS estados distintos, y confundirlos es el error que este bloque
          existe para evitar. `completitud` dice si están todos los documentos
          que el catálogo exige — eso es CONTAR. `estatus` del expediente dice
          si alguien los MIRÓ y declaró que sirven. Un expediente puede estar
          13 de 13 y no estar aprobado por nadie.
        */}
        {expediente.estatus === 'aprobado' ? (
          <div className="exito" style={{ marginBottom: '1.5rem' }}>
            <strong>Expediente aprobado.</strong> Alguien revisó que los documentos
            corresponden al cliente, y quién fue queda en el historial de abajo.
          </div>
        ) : (
          <div className="tarjeta" style={{ marginBottom: '1.5rem' }}>
            <h3>Aprobación del expediente</h3>
            <p className="tenue pequeno" style={{ margin: '0 0 .8rem' }}>
              Estar completo es que no falte nada. Aprobarlo es que alguien haya
              comprobado que lo que hay sirve — y esas dos cosas no son la misma.
            </p>
            <BotonAprobarExpediente
              expedienteId={expediente.id}
              clienteId={clienteId}
              esAdmin={sesion.rol === 'admin'}
              completo={expediente.estatus === 'completo'}
            />
          </div>
        )}

        <FormularioDatos
          clienteId={clienteId}
          expedienteId={expediente.id}
          pendientes={pendientesDeDato}
        />

        {/* Un faltante que el catálogo no declara como capturable no tiene
            formulario donde escribirse. No debería pasar —el catálogo es el
            mismo de los dos lados—, y si pasa hay que verlo, no esconderlo. */}
        {faltantesDeDato.length > pendientesDeDato.length && (
          <div className="aviso">
            <strong>Faltan datos que esta pantalla no sabe capturar</strong>:{' '}
            {faltantesDeDato
              .filter((f) => !pendientesDeDato.some((p) => p.campo === f.campo))
              .map((f) => f.etiqueta)
              .join(', ')}
            . El catálogo los exige pero no declara en qué columna van.
          </div>
        )}

        {/* El ciclo anual del Art. 21. Va antes de «Subir documento» porque
            cuando algo vence, lo primero que hay que saber es que venció. */}
        <h2 id="revision">Revisión anual</h2>
        <SeccionRevisionAnual
          clienteId={clienteId}
          expedienteId={expediente.id}
          relacionNegocios={cliente.relacion_negocios}
          verificadoEn={expediente.verificado_en}
          venceEn={expediente.vence}
          aprobado={expediente.estatus === 'aprobado'}
          puede={sesion.rol === 'admin'}
        />

        <h2>Subir documento</h2>
        {/*
          Auditoría de la semana 6: aquí bastaba con `pendientes.length > 0`, y
          un expediente NUNCA evaluado tiene cero faltantes, así que la
          pantalla anunciaba "todos los documentos obligatorios están
          presentes" sobre un expediente vacío — mientras la etiqueta de arriba
          decía "sin evaluar". Una falsa tranquilidad en una pantalla de
          cumplimiento es peor que un error.
        */}
        {!evaluado ? (
          <div className="aviso">
            <p>
              Este expediente todavía no se ha evaluado, así que <strong>no se sabe</strong> qué le
              falta. No es lo mismo que estar completo.
            </p>
            <form action={abrir.bind(null, clienteId)}>
              <button type="submit">Evaluar completitud</button>
            </form>
          </div>
        ) : pendientesDocumentales.length > 0 ? (
          <FormularioSubida
            clienteId={clienteId}
            expedienteId={expediente.id}
            campos={pendientesDocumentales}
          />
        ) : (
          <p className="sub">Todos los documentos obligatorios están presentes.</p>
        )}

        <h2>Documentos</h2>
        <table>
          <thead>
            <tr>
              <th>Documento</th>
              <th>Huella SHA-256</th>
              <th>Tamaño</th>
            </tr>
          </thead>
          <tbody>
            {docs.rows.length === 0 ? (
              <tr>
                <td className="vacia" colSpan={3}>
                  Todavía no hay documentos en este expediente.
                </td>
              </tr>
            ) : (
              (docs.rows as Documento[]).map((d) => (
                <tr key={d.id} style={d.reemplazado ? { opacity: 0.5 } : undefined}>
                  <td>
                    {etiquetas.get(d.campo) ?? d.campo}
                    {d.reemplazado && <span className="chip">reemplazado</span>}
                  </td>
                  <td>
                    <code className="hash">{d.hash_sha256}</code>
                  </td>
                  <td>{tamanoLegible(d.tamano_bytes)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        <p className="sub" style={{ marginTop: '1.5rem' }}>
          Qué integra el expediente lo decide el catálogo regulatorio, no el código. Los documentos
          exigidos aquí son el expediente de identificación estándar del Art. 18 y están{' '}
          <strong>pendientes de confirmar</strong> con un especialista PLD.
        </p>

        <h2>Historial</h2>
        <p className="sub">
          Sale de la bitácora, no de la fila del expediente. La fila dice cómo está
          hoy; esto dice cómo llegó y quién lo movió.
        </p>
        <div className="tabla-envoltura">
          <table>
            <thead>
              <tr>
                <th>Cuándo</th>
                <th>Qué pasó</th>
                <th>Quién</th>
              </tr>
            </thead>
            <tbody>
              {historial.length === 0 ? (
                <tr>
                  <td className="vacia" colSpan={3}>
                    Sin eventos registrados.
                  </td>
                </tr>
              ) : (
                historial.map((h, i) => (
                  <tr key={`${h.evento}-${String(i)}`}>
                    <td className="mono pequeno">
                      {h.ocurridoEn.replace('T', ' ').replace('Z', ' UTC')}
                    </td>
                    <td>{EVENTOS[h.evento] ?? h.evento}</td>
                    {/* "sistema" no existe aquí: todo evento del expediente lo
                        provocó una persona. Si apareciera, es un dato a mirar. */}
                    <td className="pequeno">{h.actor ?? '—'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div style={{ display: 'flex', gap: '1.5rem', marginTop: '1.5rem' }}>
          <Link href="/clientes">← Volver a clientes</Link>
          <Link href={`/clientes/${clienteId}/expediente/historico`}>
            ¿Cómo estaba en una fecha? →
          </Link>
        </div>
      </Marco>
    )
  } finally {
    await db.end()
  }
}

