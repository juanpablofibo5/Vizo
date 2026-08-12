import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { Client } from 'pg'
import { conectar, crearTenantConUsuario } from '../soporte/db'
import { almacenComo } from '../soporte/almacen'
import { BUCKET_AVISOS } from '../../src/supabase/almacen'
import { registrarOperacion } from '../../src/persistencia/operaciones'
import {
  aprobarAviso,
  generarAviso,
  generarModificatorio,
  marcarListoParaRevision,
  ModificatorioInvalido,
  registrarAcuse,
} from '../../src/persistencia/aviso'
import { validarContraXsd } from '../../src/aviso/validacion'
import { pesos } from '../../src/dominio/dinero'
import type { AlmacenDocumentos } from '../../src/persistencia/documentos'
import type { ContextoSesion } from '../../src/persistencia/transaccion'

const PERIODO = '2026-05-01'
const FOLIO = '2026-44718'
const XSD = 'regulatorio/xsd/din.xsd'

/**
 * El aviso modificatorio.
 *
 * Corregir un aviso ya presentado no es volver a generarlo: es presentar otro
 * archivo que dice CUÁL corrige —por el folio que el SPPLD asignó— y por qué.
 * El original no se toca: a partir de aprobado la fila es inmutable, y así debe
 * ser. Los dos coexisten y el historial cuenta que hubo corrección.
 */
describe('Aviso modificatorio', () => {
  let db: Client
  let admin: ContextoSesion
  let almacen: AlmacenDocumentos
  let actividadId: string
  let avisoOriginalId: string

  beforeAll(async () => {
    db = await conectar()
    const { rows } = await db.query(
      `select id::text from actividades_vulnerables where fraccion = 'V_BIS'`,
    )
    actividadId = (rows[0] as { id: string }).id
  })

  afterAll(async () => {
    await db.end()
  })

  beforeEach(async () => {
    const marca = String(Date.now()).slice(-6) + String(Math.floor(Math.random() * 900) + 100)
    admin = await crearTenantConUsuario(db, marca, 'admin')
    almacen = almacenComo(admin, BUCKET_AVISOS)

    await db.query(`insert into actividades_tenant (tenant_id, actividad_id) values ($1,$2)`, [
      admin.tenantId,
      actividadId,
    ])
    const s = await db.query(
      `insert into sucursales (tenant_id,nombre,clave) values ($1,'Matriz','MTZ') returning id`,
      [admin.tenantId],
    )
    const c = await db.query(
      `insert into clientes_finales (tenant_id,tipo_persona,rfc,nombre_o_razon_social,nacionalidad)
       values ($1,'moral',$2,'Corregible SA','MX') returning id`,
      [admin.tenantId, `MOD${marca}`],
    )
    const d = await db.query(
      `insert into desarrollos_inmobiliarios
         (tenant_id,nombre,registro_licencia,entidad_federativa,codigo_postal,colonia,calle,
          tipo_desarrollo,monto_desarrollo,unidades_comercializadas,costo_unidad,
          otras_empresas,objeto_aviso_anterior)
       values ($1,'Torre Corregible','LIC20260003','31','97000','CENTRO','CALLE 60','5',
               50000000.00,120.00,941412.75,false,false) returning id`,
      [admin.tenantId],
    )

    await registrarOperacion(db, {
      sesion: admin,
      datos: {
        sucursalId: (s.rows[0] as { id: string }).id,
        clienteId: (c.rows[0] as { id: string }).id,
        desarrolloId: (d.rows[0] as { id: string }).id,
        fechaOperacion: '2026-05-15',
        montoBase: pesos(1_200_000),
        iva: pesos(0),
        isai: pesos(0),
        otrosAccesorios: pesos(0),
        formaPago: '03',
        instrumentoMonetario: '1',
        monedaCodigo: '1',
        aportacionFideicomiso: false,
        nombreInstitucion: 'BANCO EJEMPLO',
      },
    })

    const r = await generarAviso(
      db,
      { sesion: admin, actividadId, periodo: PERIODO, granularidad: 'un_aviso_por_operacion' },
      almacen,
    )
    avisoOriginalId = r.avisoId
  })

  /** Lleva el aviso hasta `presentado`, que es lo único corregible. */
  const presentar = async (folio = FOLIO): Promise<void> => {
    await marcarListoParaRevision(db, { sesion: admin, avisoId: avisoOriginalId })
    await aprobarAviso(db, { sesion: admin, avisoId: avisoOriginalId })
    await registrarAcuse(db, {
      sesion: admin,
      avisoId: avisoOriginalId,
      storagePath: `${admin.tenantId}/${avisoOriginalId}/acuse.pdf`,
      folio,
    })
  }

  it('el modificatorio VALIDA y lleva el folio del original', async () => {
    await presentar()

    const m = await generarModificatorio(
      db,
      {
        sesion: admin,
        avisoOriginalId,
        descripcion: 'Se corrigió el monto de la aportación, que se capturó con un dígito de más',
        granularidad: 'un_aviso_por_operacion',
      },
      almacen,
    )

    expect(validarContraXsd(m.xml, XSD).errores).toEqual([])
    expect(m.xml).toContain(`<folio_modificacion>${FOLIO}</folio_modificacion>`)
    // La descripción va normalizada, como todo el texto libre del aviso.
    expect(m.xml).toContain('<descripcion_modificacion>SE CORRIGIO EL MONTO')
    // Y el desarrollo declara que ESTA operación viene modificada.
    expect(m.xml).toContain('<modificacion>SI</modificacion>')
  })

  it('el aviso ORIGINAL no se toca', async () => {
    await presentar()
    await generarModificatorio(
      db,
      { sesion: admin, avisoOriginalId, descripcion: 'Corrección', granularidad: 'un_aviso_por_operacion' },
      almacen,
    )

    // A partir de aprobado la fila es inmutable, y así debe ser: el aviso que
    // se presentó es lo que se presentó. La corrección es OTRO documento.
    const { rows } = await db.query(
      `select estatus::text, acuse_folio from avisos where id = $1`,
      [avisoOriginalId],
    )
    expect(rows[0]).toEqual({ estatus: 'presentado', acuse_folio: FOLIO })
  })

  it('solo se corrige lo YA PRESENTADO', async () => {
    // Un aviso que todavía no salió se arregla antes de presentarlo, y eso no
    // es un modificatorio: no hay nada que la autoridad tenga que reconciliar.
    await expect(
      generarModificatorio(
        db,
        { sesion: admin, avisoOriginalId, descripcion: 'x', granularidad: 'un_aviso_por_operacion' },
        almacen,
      ),
    ).rejects.toThrow(/ya presentado/i)
  })

  it('sin descripción NO se genera', async () => {
    await presentar()
    await expect(
      generarModificatorio(
        db,
        { sesion: admin, avisoOriginalId, descripcion: '   ', granularidad: 'un_aviso_por_operacion' },
        almacen,
      ),
    ).rejects.toThrow(ModificatorioInvalido)
  })

  it('un folio con otra forma no llega a guardarse', async () => {
    // Se valida al registrar el ACUSE, no al corregir: si se aceptara aquí, el
    // problema aparecería meses después, cuando el modificatorio no valide y la
    // fila ya no se pueda cambiar.
    await marcarListoParaRevision(db, { sesion: admin, avisoId: avisoOriginalId })
    await aprobarAviso(db, { sesion: admin, avisoId: avisoOriginalId })

    await expect(
      registrarAcuse(db, {
        sesion: admin,
        avisoId: avisoOriginalId,
        storagePath: `${admin.tenantId}/${avisoOriginalId}/acuse.pdf`,
        folio: 'ACUSE-2026',
      }),
    ).rejects.toThrow(/forma que el SPPLD asigna/)
  })

  it('un periodo admite DOS modificatorios: corregir dos veces pasa', async () => {
    await presentar()
    const uno = await generarModificatorio(
      db,
      { sesion: admin, avisoOriginalId, descripcion: 'Primera corrección', granularidad: 'un_aviso_por_operacion' },
      almacen,
    )
    const dos = await generarModificatorio(
      db,
      { sesion: admin, avisoOriginalId, descripcion: 'Segunda corrección', granularidad: 'un_aviso_por_operacion' },
      almacen,
    )

    expect(uno.avisoId).not.toBe(dos.avisoId)
    const { rows } = await db.query(
      `select count(*)::int as n from avisos
        where tenant_id = $1 and periodo = $2::date and tipo = 'modificatorio'`,
      [admin.tenantId, PERIODO],
    )
    expect((rows[0] as { n: number }).n).toBe(2)
  })

  it('deja en la bitácora QUÉ corrige y por qué', async () => {
    await presentar()
    const m = await generarModificatorio(
      db,
      {
        sesion: admin,
        avisoOriginalId,
        descripcion: 'Se corrigió la colonia del desarrollo',
        granularidad: 'un_aviso_por_operacion',
      },
      almacen,
    )

    const { rows } = await db.query(
      `select datos from bitacora
        where tenant_id = $1 and objeto_id = $2 and evento = 'aviso.modificatorio_generado'`,
      [admin.tenantId, m.avisoId],
    )
    const datos = (rows[0] as { datos: Record<string, unknown> }).datos
    expect(datos['modifica_a']).toBe(avisoOriginalId)
    expect(datos['folio_original']).toBe(FOLIO)
    expect(datos['descripcion']).toBe('Se corrigió la colonia del desarrollo')
  })
})
