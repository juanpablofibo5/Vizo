import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { Client } from 'pg'
import { conectar, crearTenantConUsuario } from '../soporte/db'
import { almacenComo } from '../soporte/almacen'
import { BUCKET_AVISOS } from '../../src/supabase/almacen'
import { registrarOperacion } from '../../src/persistencia/operaciones'
import { generarAviso, reglaFechaDelActo } from '../../src/persistencia/aviso'
import {
  PeriodoSinActos,
  ReglaDeFechaDesconocida,
  SinReglaDeFechaDelActo,
  fechaDelActo,
} from '../../src/dominio/fecha-del-acto'
import { pesos } from '../../src/dominio/dinero'
import type { AlmacenDocumentos } from '../../src/persistencia/documentos'
import type { ContextoSesion } from '../../src/persistencia/transaccion'

/** Un periodo ANTERIOR a la vigencia del Acuerdo. */
const ANTES = '2026-05-01'
/** Y uno posterior. */
const DESPUES = '2026-12-01'

/**
 * Qué fecha cuenta como la del acto.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * LA FUENTE
 * ────────────────────────────────────────────────────────────────────────────
 * Art. 24 Bis del Acuerdo 115/2026, fracción IV: para la Fr. V Bis, la fecha
 * del acto es «aquélla en que se recibió y destinó la ÚLTIMA APORTACIÓN a un
 * desarrollo inmobiliario, EN EL MES CALENDARIO». Y el último párrafo del mismo
 * artículo: de ahí «se iniciará el conteo del plazo máximo para la presentación
 * del Aviso» del Art. 23 de la Ley.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * LO QUE EL ARTÍCULO NO DICE
 * ────────────────────────────────────────────────────────────────────────────
 * La enumeración cubre las fracciones I, II, III, V, V Bis, VI, VII, VIII, IX,
 * X, XI, XIII y XVI. **La Fr. XV no aparece.** Para ella rige el encabezado
 * —«además de las establecidas en los artículos 5 y 24 del Reglamento»— que no
 * se ha contrastado.
 *
 * Estos casos fijan que esa ausencia se comporte como ausencia: ni se rellena
 * con la regla de al lado ni se ignora.
 */
describe('La fecha del acto', () => {
  describe('la regla, sin base', () => {
    it('toma la ÚLTIMA aportación del mes, no la primera ni la del corte', () => {
      expect(
        fechaDelActo('ultima_aportacion_del_mes', ['2026-12-03', '2026-12-28', '2026-12-11'], DESPUES),
      ).toBe('2026-12-28')
    })

    it('con una sola aportación, esa es', () => {
      expect(fechaDelActo('ultima_aportacion_del_mes', ['2026-12-03'], DESPUES)).toBe('2026-12-03')
    })

    it('sin actos no inventa una fecha', () => {
      // Un informe en cero no tiene fecha del acto porque no hubo acto. Devolver
      // el primer día del periodo sería un dato plausible y falso, y de él
      // colgaría un plazo.
      expect(() => fechaDelActo('ultima_aportacion_del_mes', [], DESPUES)).toThrow(PeriodoSinActos)
    })

    it('una regla que el motor no sabe aplicar lo detiene', () => {
      // El día que el catálogo traiga la fracción II —«el último día del mes que
      // corresponda al consumo»— este motor no la sabe resolver. Aproximarla con
      // la que sí conoce daría una fecha de aspecto correcto.
      expect(() =>
        fechaDelActo('ultimo_dia_del_mes_de_consumo', ['2026-12-03'], DESPUES),
      ).toThrow(ReglaDeFechaDesconocida)
    })
  })

  describe('la fracción que el Art. 24 Bis NO enumera', () => {
    let db: Client
    let vBis: string
    let xv: string

    beforeAll(async () => {
      db = await conectar()
      const { rows } = await db.query(
        `select fraccion::text, id::text from actividades_vulnerables
          where fraccion in ('V_BIS','XV')`,
      )
      const filas = rows as Array<{ fraccion: string; id: string }>
      vBis = filas.find((f) => f.fraccion === 'V_BIS')?.id ?? ''
      xv = filas.find((f) => f.fraccion === 'XV')?.id ?? ''
    })

    afterAll(async () => {
      await db.end()
    })

    it('la Fr. V Bis sí tiene regla desde la vigencia', async () => {
      expect(await reglaFechaDelActo(db, { actividadId: vBis, fecha: DESPUES })).toBe(
        'ultima_aportacion_del_mes',
      )
    })

    it('la Fr. XV SE DETIENE cuando el Acuerdo ya está en vigor', async () => {
      // EL CASO DEL HALLAZGO. El Art. 24 Bis enumera I, II, III, V, V Bis, VI,
      // VII, VIII, IX, X, XI, XIII y XVI. La XV no está, así que para ella rige
      // el Reglamento —sin contrastar—. Heredarle la regla de V Bis habría
      // corrido el plazo desde la fecha equivocada, en silencio.
      await expect(reglaFechaDelActo(db, { actividadId: xv, fecha: DESPUES })).rejects.toThrow(
        SinReglaDeFechaDelActo,
      )
    })

    it('y antes de la vigencia no se detiene: no había nada que exigir', async () => {
      expect(await reglaFechaDelActo(db, { actividadId: xv, fecha: ANTES })).toBeNull()
    })
  })

  describe('contra la base', () => {
    let db: Client
    let admin: ContextoSesion
    let almacen: AlmacenDocumentos
    let actividadId: string
    let sucursalId: string
    let clienteId: string
    let desarrolloId: string

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
        `insert into sucursales (tenant_id,nombre,clave) values ($1,'Matriz','MTZ') returning id::text`,
        [admin.tenantId],
      )
      sucursalId = (s.rows[0] as { id: string }).id
      const c = await db.query(
        `insert into clientes_finales (tenant_id,tipo_persona,rfc,nombre_o_razon_social,nacionalidad)
         values ($1,'moral',$2,'Compradora SA','MX') returning id::text`,
        [admin.tenantId, `FDA${marca}`],
      )
      clienteId = (c.rows[0] as { id: string }).id
      const d = await db.query(
        `insert into desarrollos_inmobiliarios
           (tenant_id,nombre,registro_licencia,entidad_federativa,codigo_postal,colonia,calle,
            tipo_desarrollo,monto_desarrollo,unidades_comercializadas,costo_unidad,
            otras_empresas,objeto_aviso_anterior)
         values ($1,'Torre Acto',$2,'31','97000','CENTRO','CALLE 60','5',
                 50000000.00,120.00,941412.75,false,false) returning id::text`,
        [admin.tenantId, `LICF${marca}`],
      )
      desarrolloId = (d.rows[0] as { id: string }).id
    })

    const aportar = async (fecha: string): Promise<void> => {
      await registrarOperacion(db, {
        sesion: admin,
        datos: {
          sucursalId,
          clienteId,
          desarrolloId,
          fechaOperacion: fecha,
          montoBase: pesos(1_200_000),
          iva: pesos(0),
          isai: pesos(0),
          otrosAccesorios: pesos(0),
          formaPago: '03',
          instrumentoMonetario: '1',
          monedaCodigo: '1',
        },
      })
    }

    const generar = (periodo: string) =>
      generarAviso(
        db,
        { sesion: admin, actividadId, periodo, granularidad: 'un_aviso_por_periodo' },
        almacen,
      )

    const fechaActoDe = async (avisoId: string): Promise<string | null> => {
      const { rows } = await db.query(
        `select fecha_acto::text from avisos where id = $1`,
        [avisoId],
      )
      return (rows[0] as { fecha_acto: string | null }).fecha_acto
    }

    it('desde el 30 de noviembre, el aviso declara la última aportación del mes', async () => {
      await aportar('2026-12-04')
      await aportar('2026-12-19')
      await aportar('2026-12-11')

      const r = await generar(DESPUES)
      expect(await fechaActoDe(r.avisoId)).toBe('2026-12-19')
    })

    it('antes de esa fecha NO la declara, y eso no es un hueco', async () => {
      // El Art. 24 Bis entra el 30 de noviembre de 2026 (Transitorio Primero).
      // Para un periodo anterior no hay regla que aplicar: el plazo sale del
      // Art. 23 de la Ley, que manda desde 2013. Rellenarlo igual sería
      // aplicarle al obligado una norma que todavía no existía.
      await aportar('2026-05-10')
      await aportar('2026-05-22')

      const r = await generar(ANTES)
      expect(await fechaActoDe(r.avisoId)).toBeNull()
    })

    it('el informe en cero no la lleva: no hubo acto', async () => {
      const r = await generar(DESPUES)
      expect(await fechaActoDe(r.avisoId)).toBeNull()
    })

    it('la base rechaza una fecha del acto fuera del periodo', async () => {
      // Si cayera fuera, el plazo calculado no sería el que la Ley pide y el
      // aviso se presentaría tarde o pronto sin que nadie lo note.
      await aportar('2026-12-04')
      const r = await generar(DESPUES)

      await expect(
        db.query(`update avisos set fecha_acto = '2027-01-15' where id = $1`, [r.avisoId]),
      ).rejects.toThrow(/fecha_acto_dentro_del_periodo/)
    })
  })
})
