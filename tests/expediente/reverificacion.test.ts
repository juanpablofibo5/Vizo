import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { Client } from 'pg'
import { conectar, crearTenantConUsuario } from '../soporte/db'
import { almacenComo } from '../soporte/almacen'
import { BUCKET_EXPEDIENTES } from '../../src/supabase/almacen'
import { abrirExpediente, recalcularCompletitud } from '../../src/persistencia/expediente'
import { registrarDocumento } from '../../src/persistencia/documentos'
import {
  VerificacionImposible,
  declararRelacionDeNegocios,
  pendientesDeRevision,
  verificarExpediente,
} from '../../src/persistencia/reverificacion'
import { enTransaccionDeSesion, type ContextoSesion } from '../../src/persistencia/transaccion'

const HOY = '2026-08-15'

/**
 * La revisión anual del expediente.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * LA FUENTE
 * ────────────────────────────────────────────────────────────────────────────
 * Art. 21 del Acuerdo 115/2026: verificar «cuando menos una vez al año» que los
 * expedientes de los clientes «CON LOS QUE SE TENGA UNA RELACIÓN DE NEGOCIOS»
 * cuenten con todo y estén actualizados.
 *
 * Y el Art. 3 fr. XIV, que decide a quién le aplica: Relación de negocios es la
 * «formal y habitual», EXCLUYENDO «los actos u operaciones que se celebren
 * ocasionalmente».
 *
 * ────────────────────────────────────────────────────────────────────────────
 * LO QUE ESTOS CASOS PROTEGEN
 * ────────────────────────────────────────────────────────────────────────────
 * Que verificar signifique algo. Una casilla que se marca sin mirar convierte
 * una obligación anual en un clic, y deja por escrito —con fecha y con nombre—
 * que alguien revisó lo que no revisó. Es peor que no tener la función.
 */
describe('La revisión anual del expediente', () => {
  let db: Client
  let admin: ContextoSesion
  let capturista: ContextoSesion
  let clienteId: string
  let expedienteId: string

  beforeAll(async () => {
    db = await conectar()
  })

  afterAll(async () => {
    await db.end()
  })

  /** Un expediente completo y aprobado: el punto de partida del ciclo. */
  const integrarYAprobar = async (): Promise<void> => {
    const campos = await db.query(
      `select ce.campo, ce.tipo_dato::text as tipo_dato
         from campos_expediente ce
         join actividades_vulnerables a on a.id = ce.actividad_id
        where a.fraccion = 'V_BIS'
          and ce.aplica_a::text in ('ambas','persona_moral')
          and ce.obligatorio
          and ce.vigente_desde <= $1::date
          and (ce.vigente_hasta is null or ce.vigente_hasta >= $1::date)`,
      [HOY],
    )

    for (const c of campos.rows as Array<{ campo: string; tipo_dato: string }>) {
      if (c.tipo_dato !== 'documento') continue
      await registrarDocumento(db, almacenComo(admin, BUCKET_EXPEDIENTES), {
        sesion: admin,
        expedienteId,
        documento: {
          campo: c.campo,
          nombreArchivo: `${c.campo}.pdf`,
          mime: 'application/pdf',
          bytes: new TextEncoder().encode(c.campo),
        },
      })
    }

    const r = await recalcularCompletitud(db, { sesion: admin, expedienteId, fecha: HOY })
    expect(r.estatus).toBe('completo')

    await enTransaccionDeSesion(db, admin, async () => {
      await db.query('select app.expediente_aprobar($1)', [expedienteId])
    })
  }

  beforeEach(async () => {
    const marca = String(Date.now()).slice(-6) + String(Math.floor(Math.random() * 900) + 100)
    admin = await crearTenantConUsuario(db, marca, 'admin')
    capturista = { ...admin, rol: 'capturista' }

    await db.query(
      `insert into actividades_tenant (tenant_id, actividad_id)
       select $1, id from actividades_vulnerables where fraccion = 'V_BIS'`,
      [admin.tenantId],
    )
    // Todos los datos no documentales de una persona moral, para que la
    // completitud dependa solo de los documentos que sube el test.
    const c = await db.query(
      `insert into clientes_finales
         (tenant_id,tipo_persona,rfc,nombre_o_razon_social,nacionalidad,
          fecha_nacimiento_o_constitucion,domicilio,giro_mercantil)
       values ($1,'moral',$2,'Compradora Habitual SA','MX','2010-01-01',
               '{"calle":"CALLE 60","cp":"97000"}'::jsonb,'1')
       returning id::text`,
      [admin.tenantId, `RVF${marca}`],
    )
    clienteId = (c.rows[0] as { id: string }).id

    const e = await abrirExpediente(db, { sesion: admin, clienteId })
    expedienteId = e.expedienteId
  })

  const pendientes = (hoy: string, diasDeAviso = 30) =>
    enTransaccionDeSesion(db, admin, () =>
      pendientesDeRevision(db, { sesion: admin, hoy, diasDeAviso }),
    )

  describe('a quién le aplica el ciclo', () => {
    beforeEach(async () => {
      await integrarYAprobar()
      // El reloj arranca en la aprobación, que es ahora: se consulta con un
      // "hoy" de dentro de un año para que el vencimiento ya cuente.
    })

    const dentroDeUnAnio = (): string => {
      const d = new Date(`${HOY}T00:00:00Z`)
      d.setUTCFullYear(d.getUTCFullYear() + 1)
      return d.toISOString().slice(0, 10)
    }

    it('un cliente SIN declarar no entra: no se le inventa la obligación', async () => {
      // Ni dentro ni fuera. Es el tercer estado que este proyecto insiste en no
      // perder: «todavía no sé» no es «no debes».
      expect(await pendientes(dentroDeUnAnio())).toEqual([])
    })

    it('un cliente OCASIONAL tampoco: el Art. 21 lo excluye expresamente', async () => {
      await declararRelacionDeNegocios(db, { sesion: admin, clienteId, hay: false })
      expect(await pendientes(dentroDeUnAnio())).toEqual([])
    })

    it('un cliente con RELACIÓN DE NEGOCIOS sí, y con su fecha de vencimiento', async () => {
      await declararRelacionDeNegocios(db, { sesion: admin, clienteId, hay: true })

      const lista = await pendientes(dentroDeUnAnio())
      expect(lista).toHaveLength(1)
      expect(lista[0]?.cliente).toBe('Compradora Habitual SA')
      expect(lista[0]?.verificadoEn).toBeNull()
      // Nunca verificado: el año corre desde la aprobación, que fue hoy.
      expect(lista[0]?.vence).toBe(dentroDeUnAnio())
    })

    it('y no aparece antes de tiempo', async () => {
      await declararRelacionDeNegocios(db, { sesion: admin, clienteId, hay: true })

      // A mitad del año no hay nada que hacer, y una lista que lo mostrara
      // igual enseñaría a ignorarla.
      expect(await pendientes('2027-01-01')).toEqual([])
    })
  })

  describe('verificar significa algo', () => {
    it('un expediente incompleto NO se puede dar por verificado', async () => {
      // EL CASO CENTRAL. Sin esto, la revisión anual sería una casilla, y la
      // casilla dejaría por escrito que alguien revisó lo que no revisó.
      await integrarYAprobar()
      await declararRelacionDeNegocios(db, { sesion: admin, clienteId, hay: true })

      // Se le quita un dato al cliente: el expediente aprobado NO se degrada
      // solo —esa es la regla de la aprobación— pero la verificación sí mira.
      await db.query(`update clientes_finales set giro_mercantil = null where id = $1`, [clienteId])

      await expect(
        verificarExpediente(db, { sesion: admin, expedienteId, hoy: HOY }),
      ).rejects.toThrow(VerificacionImposible)
    })

    it('y el mensaje dice QUÉ falta, no que falló', async () => {
      await integrarYAprobar()
      await db.query(`update clientes_finales set giro_mercantil = null where id = $1`, [clienteId])

      await expect(
        verificarExpediente(db, { sesion: admin, expedienteId, hoy: HOY }),
      ).rejects.toThrow(/[Gg]iro/)
    })

    it('uno completo sí, y sale de la lista por un año', async () => {
      await integrarYAprobar()
      await declararRelacionDeNegocios(db, { sesion: admin, clienteId, hay: true })

      const r = await verificarExpediente(db, { sesion: admin, expedienteId, hoy: HOY })
      expect(r.estatus).toBe('completo')

      const { rows } = await db.query(
        `select verificado_en::text, verificado_completitud->>'estatus' as estatus
           from expedientes where id = $1`,
        [expedienteId],
      )
      const fila = rows[0] as { verificado_en: string; estatus: string }
      // La evidencia queda guardada junto a la firma, que es lo que hace
      // auditable la afirmación en vez de solo registrada.
      expect(fila.estatus).toBe('completo')
      expect(fila.verificado_en).not.toBeNull()
    })

    it('un capturista no verifica: la afirmación la firma un admin', async () => {
      await integrarYAprobar()

      await expect(
        verificarExpediente(db, { sesion: capturista, expedienteId, hoy: HOY }),
      ).rejects.toThrow()
    })

    it('un expediente sin aprobar no se reverifica: primero se integra', async () => {
      // Reverificar es reafirmar. Sobre algo que nadie afirmó nunca no hay nada
      // que reafirmar, y dejarlo pasar produciría expedientes «verificados» que
      // ningún humano miró jamás.
      await expect(
        verificarExpediente(db, { sesion: admin, expedienteId, hoy: HOY }),
      ).rejects.toThrow()
    })
  })

  it('la verificación queda en la bitácora sin datos personales', async () => {
    // REGLA DURA 3: cuántos requisitos se cubrieron, nunca cuáles valores.
    await integrarYAprobar()
    await verificarExpediente(db, { sesion: admin, expedienteId, hoy: HOY })

    const { rows } = await db.query(
      `select datos::text from bitacora
        where tenant_id = $1 and evento = 'expediente.verificado'`,
      [admin.tenantId],
    )
    expect(rows).toHaveLength(1)
    const datos = (rows[0] as { datos: string }).datos
    expect(datos).toContain('verificado_en')
    expect(datos).not.toContain('Compradora')
    expect(datos).not.toContain('CALLE 60')
  })
})
