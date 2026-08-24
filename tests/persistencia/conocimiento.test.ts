import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { Client } from 'pg'
import { conectar, crearTenantConUsuario } from '../soporte/db'
import { enTransaccionDeSesion, type ContextoSesion } from '../../src/persistencia/transaccion'
import { registrarOperacion } from '../../src/persistencia/operaciones'
import { conocimientoDeClientes } from '../../src/persistencia/conocimiento'
import { estadoDeAprobacion } from '../../src/persistencia/aprobacion'
import { estadoPepDelCliente } from '../../src/persistencia/pep'
import { estadoDelPerfil, registrarPerfil } from '../../src/persistencia/perfil'
import { riesgoDelCliente } from '../../src/persistencia/riesgo'
import {
  rielAprobacion,
  rielGradoDeRiesgo,
  rielPep,
  rielPerfil,
  rielRevisionAnual,
  type EstadoDeRiel,
} from '../../app/componentes/riel'
import { pesos } from '../../src/dominio/dinero'

/**
 * LA PRUEBA DE ACUERDO.
 *
 * La lista de clientes resume el conocimiento del cliente con una consulta por
 * lote; el expediente lo arma cliente por cliente. Son dos caminos a la base
 * para el mismo hecho, y dos caminos divergen: alguien arregla el `distinct on`
 * de un lado, o mete un filtro nuevo, y las dos pantallas empiezan a decir
 * cosas distintas del mismo cliente sin que nada reviente.
 *
 * Eso no sería un defecto cosmético. La lista es donde alguien decide a quién
 * atender primero: un resumen más tranquilo que el expediente es la regla dura
 * 6 —el número plausible y equivocado— en la pantalla de triaje.
 *
 * Así que esta prueba no comprueba palabras: comprueba que **los dos caminos
 * producen el mismo `EstadoDeRiel`**, sección por sección, sobre clientes en
 * estados distintos a propósito. Si divergen, muere aquí y no en producción.
 */
describe('La lista y el expediente dicen lo mismo del mismo cliente', () => {
  let db: Client
  let sesion: ContextoSesion
  let sucursalId: string
  let desarrolloId: string
  let marca: string
  let modeloId: string
  let grados: Record<string, string>

  // Después del Transitorio Cuarto a propósito: antes de esa fecha casi todo
  // sale `anticipado` y los estados interesantes no se distinguen.
  const HOY = '2027-04-10'

  beforeAll(async () => {
    db = await conectar()
  })

  afterAll(async () => {
    await db.end()
  })

  // El RFC lleva un contador y no las letras del nombre: derivarlo del nombre
  // colisionaba entre «Cliente Vacío» y «Cliente PEP», y el RFC es único por
  // obligado.
  let n = 0
  const crearCliente = async (nombre: string, tipo: 'fisica' | 'moral') => {
    n += 1
    const c = await db.query(
      `insert into clientes_finales (tenant_id,tipo_persona,rfc,nombre_o_razon_social,nacionalidad)
       values ($1,$2,$3,$4,'MX') returning id::text`,
      [sesion.tenantId, tipo, `C${String(n)}${marca}`, nombre],
    )
    return (c.rows[0] as { id: string }).id
  }

  const declararPep = async (clienteId: string, enFunciones: boolean) => {
    await db.query('begin')
    const r = await db.query(
      `insert into declaraciones_pep (tenant_id,cliente_id,resultado,fecha_declaracion,capturada_por)
       values ($1,$2,'pep_por_funcion',date '2027-03-01',$3) returning id::text`,
      [sesion.tenantId, clienteId, sesion.usuarioId],
    )
    await db.query(
      `insert into vinculos_pep (tenant_id,declaracion_id,tipo,cargo,ambito,en_funciones,fecha_cese)
       values ($1,$2,'titular','Directora de área','nacional',$3,$4)`,
      [
        sesion.tenantId,
        (r.rows[0] as { id: string }).id,
        enFunciones,
        // Un cese viejo hace correr los dos relojes hasta agotarlos: es como se
        // llega a `relojes_vencidos`, que es un estado y no un error.
        enFunciones ? null : '2024-01-15',
      ],
    )
    await db.query('commit')
  }

  const negarPep = (clienteId: string) =>
    db.query(
      `insert into declaraciones_pep (tenant_id,cliente_id,resultado,fecha_declaracion,capturada_por)
       values ($1,$2,'niega',date '2027-03-01',$3)`,
      [sesion.tenantId, clienteId, sesion.usuarioId],
    )

  const clasificar = (clienteId: string, clave: 'alto' | 'medio', vence: string) =>
    db.query(
      `insert into evaluaciones_riesgo
         (tenant_id,cliente_id,modelo_id,grado_id,puntaje,factores_aplicados,evaluado_por,vence)
       values ($1,$2,$3,$4,$5,'[]'::jsonb,$6,$7::date)`,
      [
        sesion.tenantId,
        clienteId,
        modeloId,
        grados[clave],
        clave === 'alto' ? 80 : 40,
        sesion.usuarioId,
        vence,
      ],
    )

  const operar = (clienteId: string, fecha: string, monto = 400_000) =>
    registrarOperacion(db, {
      sesion,
      datos: {
        sucursalId,
        clienteId,
        desarrolloId,
        fechaOperacion: fecha,
        montoBase: pesos(monto),
        iva: pesos(0),
        isai: pesos(0),
        otrosAccesorios: pesos(0),
        formaPago: '03',
      },
    })

  beforeEach(async () => {
    n = 0
    marca = String(Date.now()).slice(-6) + String(Math.floor(Math.random() * 900) + 100)
    sesion = await crearTenantConUsuario(db, marca, 'admin')
    await db.query(`update tenants set tipo_persona = 'moral' where id = $1`, [sesion.tenantId])

    const vBis = await db.query(`select id from actividades_vulnerables where fraccion = 'V_BIS'`)
    await db.query(`insert into actividades_tenant (tenant_id, actividad_id) values ($1,$2)`, [
      sesion.tenantId,
      (vBis.rows[0] as { id: string }).id,
    ])

    const s = await db.query(
      `insert into sucursales (tenant_id,nombre,clave) values ($1,'Matriz','MTZ') returning id::text`,
      [sesion.tenantId],
    )
    sucursalId = (s.rows[0] as { id: string }).id

    const d = await db.query(
      `insert into desarrollos_inmobiliarios
         (tenant_id,nombre,registro_licencia,entidad_federativa,codigo_postal,colonia,calle,
          tipo_desarrollo,monto_desarrollo,unidades_comercializadas,costo_unidad)
       values ($1,'Torre Acuerdo',$2,'31','97000','CENTRO','CALLE 60','5',
               50000000.00,120.00,941412.75) returning id::text`,
      [sesion.tenantId, `LICC${marca}`],
    )
    desarrolloId = (d.rows[0] as { id: string }).id

    grados = {}
    for (const [c, n, o, alto, min] of [
      ['bajo', 'Bajo', 1, false, 0],
      ['medio', 'Medio', 2, false, 35],
      ['alto', 'Alto', 3, true, 70],
    ] as const) {
      const r = await db.query(
        `insert into grados_riesgo (tenant_id,clave,nombre,orden,es_alto,puntaje_minimo,vigente_desde)
         values ($1,$2,$3,$4,$5,$6,date '2027-03-01') returning id::text`,
        [sesion.tenantId, c, n, o, alto, min],
      )
      grados[c] = (r.rows[0] as { id: string }).id
    }
    const el = await db.query(`select id from elementos_riesgo where clave = 'tipo_cliente'`)
    const m = await db.query(
      `insert into modelos_riesgo (tenant_id,version) values ($1,1) returning id::text`,
      [sesion.tenantId],
    )
    modeloId = (m.rows[0] as { id: string }).id
    await db.query(
      `insert into factores_modelo (tenant_id,modelo_id,elemento_id,factor,peso)
       values ($1,$2,$3,'Persona Políticamente Expuesta',80)`,
      [sesion.tenantId, modeloId, (el.rows[0] as { id: string }).id],
    )
    await db.query(
      `update modelos_riesgo set estado='vigente', vigente_desde=date '2027-03-01',
              aprobado_por=$2, aprobado_en=now() where id=$1`,
      [modeloId, sesion.usuarioId],
    )
  })

  /** Lo que dice el EXPEDIENTE: cuatro lecturas de un solo cliente. */
  const porExpediente = (clienteId: string, tipo: 'fisica' | 'moral') =>
    enTransaccionDeSesion(db, sesion, async (): Promise<Record<string, EstadoDeRiel>> => {
      const riesgo = await riesgoDelCliente(db, { sesion, clienteId, hoy: HOY })
      const perfil = await estadoDelPerfil(db, { sesion, clienteId, hoy: HOY })
      const aprobacion = await estadoDeAprobacion(db, { sesion, clienteId, hoy: HOY })
      const pep =
        tipo === 'fisica'
          ? await estadoPepDelCliente(db, { sesion, clienteId, hoy: HOY })
          : null
      const { rows } = await db.query(
        `select c.relacion_negocios, r.vence::text as vence
           from clientes_finales c
           left join expedientes_por_reverificar r on r.cliente_id = c.id
          where c.id = $1`,
        [clienteId],
      )
      const f = rows[0] as { relacion_negocios: boolean | null; vence: string | null }
      return {
        revision: rielRevisionAnual({
          relacionNegocios: f.relacion_negocios,
          vence: f.vence,
          hoy: HOY,
        }),
        riesgo: rielGradoDeRiesgo(riesgo),
        perfil: rielPerfil(perfil),
        aprobacion: rielAprobacion(aprobacion),
        pep: rielPep(pep),
      }
    })

  /** Lo que dice la LISTA: una consulta por lote para todos. */
  const porLista = (clientes: { id: string; tipoPersona: string }[]) =>
    enTransaccionDeSesion(db, sesion, async () => {
      const mapa = await conocimientoDeClientes(db, {
        sesion,
        hoy: HOY,
        clientes: clientes.map((c) => ({
          id: c.id,
          tipoPersona: c.tipoPersona,
          relacionNegocios: null,
        })),
      })
      return mapa
    })

  it('coinciden sección por sección sobre cinco clientes en estados distintos', async () => {
    // Cinco estados elegidos porque cada uno rompe un camino distinto del
    // código: el que no tiene nada, el PEP alto que ya operó (el único
    // «exigible» de la tabla), el que niega, el de relojes agotados, y una
    // persona moral —a la que el Art. 23 Quáter ni siquiera le aplica—.
    const vacio = await crearCliente('Cliente Vacio', 'fisica')

    const pepAlto = await crearCliente('Cliente PepAlto', 'fisica')
    await declararPep(pepAlto, true)
    await clasificar(pepAlto, 'alto', '2027-10-01')
    await operar(pepAlto, '2027-03-20')

    const niega = await crearCliente('Cliente Niega', 'fisica')
    await negarPep(niega)
    await clasificar(niega, 'medio', '2027-10-01')

    // Grado vencido a propósito: el estado donde «vencido nunca tranquiliza».
    //
    // El vencimiento va en el pasado REAL y no antes de `HOY`, porque las dos
    // rutas derivan `vencida` con el reloj de la base —`now() at time zone
    // 'America/Mexico_City'`— y no con el `hoy` que reciben. En producción son
    // el mismo día y da igual; en una prueba con fecha sintética no. La primera
    // versión de este fixture ponía '2027-04-01' contra un HOY de '2027-04-10'
    // y salía NO vencido: el caso no se ejercía, y el sabotaje que apagaba
    // `vencida` en el lote pasaba sin que nadie se enterara.
    const vencido = await crearCliente('Cliente Vencido', 'fisica')
    await declararPep(vencido, false)
    await clasificar(vencido, 'alto', '2026-06-01')

    const moral = await crearCliente('Cliente Moral', 'moral')
    await clasificar(moral, 'medio', '2027-10-01')
    // El perfil se ancla al ACTO, no a la captura (Art. 23 Ter 1 ¶2): sin el
    // id de la operación la base lo rechaza, y hace bien.
    const acto = await operar(moral, '2027-03-15')
    await enTransaccionDeSesion(db, sesion, () =>
      registrarPerfil(db, {
        sesion,
        clienteId: moral,
        hoy: HOY,
        datos: {
          origen: 'inicial',
          fuente: 'declarada_por_cliente',
          montoMaximoMensual: pesos(500_000),
          operacionId: acto.operacionId,
        },
      }),
    )

    const clientes = [
      { id: vacio, tipoPersona: 'fisica' as const },
      { id: pepAlto, tipoPersona: 'fisica' as const },
      { id: niega, tipoPersona: 'fisica' as const },
      { id: vencido, tipoPersona: 'fisica' as const },
      { id: moral, tipoPersona: 'moral' as const },
    ]

    const lista = await porLista(clientes)

    for (const c of clientes) {
      const esperado = await porExpediente(c.id, c.tipoPersona)
      const k = lista.get(c.id)
      expect(k, `falta el cliente ${c.id} en el resumen por lote`).toBeDefined()
      if (k === undefined) continue

      // La comparación es del ESTADO COMPLETO —palabra, tono y reloj—, no solo
      // del tono: si la lista dijera «Alto» donde el expediente dice «Alto ·
      // vencido», el color coincidiría y la frase mentiría.
      expect(
        rielRevisionAnual({
          relacionNegocios: k.revision.relacionNegocios,
          vence: k.revision.vence,
          hoy: HOY,
        }),
        `revisión anual difiere en ${c.id}`,
      ).toEqual(esperado['revision'])
      expect(rielGradoDeRiesgo(k.riesgo), `grado difiere en ${c.id}`).toEqual(esperado['riesgo'])
      expect(rielPerfil(k.perfil), `perfil difiere en ${c.id}`).toEqual(esperado['perfil'])
      expect(rielAprobacion(k.aprobacion), `aprobación difiere en ${c.id}`).toEqual(
        esperado['aprobacion'],
      )
      expect(rielPep(k.pep), `PEP difiere en ${c.id}`).toEqual(esperado['pep'])
    }
  })

  it('los estados de la muestra son de verdad distintos — si no, la prueba no prueba nada', async () => {
    // Una prueba de acuerdo pasa trivialmente si todos los clientes están en el
    // mismo estado. Esto verifica que la muestra tenga variedad: al menos un
    // rojo, un ámbar y un verde entre las cinco secciones de los cinco.
    const pepAlto = await crearCliente('Variedad PepAlto', 'fisica')
    await declararPep(pepAlto, true)
    await clasificar(pepAlto, 'alto', '2027-10-01')
    await operar(pepAlto, '2027-03-20')

    const niega = await crearCliente('Variedad Niega', 'fisica')
    await negarPep(niega)

    const lista = await porLista([
      { id: pepAlto, tipoPersona: 'fisica' },
      { id: niega, tipoPersona: 'fisica' },
    ])

    const tonos = new Set<string>()
    for (const k of lista.values()) {
      tonos.add(rielGradoDeRiesgo(k.riesgo).tono)
      tonos.add(rielAprobacion(k.aprobacion).tono)
      tonos.add(rielPep(k.pep).tono)
    }
    expect(tonos.has('critico'), 'la muestra no tiene ningún estado crítico').toBe(true)
    expect(tonos.has('aviso'), 'la muestra no tiene ningún ámbar').toBe(true)
    expect(tonos.has('ok'), 'la muestra no tiene ningún verde').toBe(true)
  })

  it('un cliente sin nada no desaparece del mapa: sale con sus huecos', async () => {
    const solo = await crearCliente('Cliente Solo', 'fisica')
    const lista = await porLista([{ id: solo, tipoPersona: 'fisica' }])

    const k = lista.get(solo)
    expect(k).toBeDefined()
    if (k === undefined) return
    // Sin declaración PEP y sin grado, el Art. 23 Ter 5 no da «no se requiere».
    expect(k.aprobacion.exigencia.estado).toBe('indeterminable')
    expect(rielAprobacion(k.aprobacion).estado).toBe('No se sabe')
  })
})
