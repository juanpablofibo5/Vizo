import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { Client } from 'pg'
import { conectar, crearTenantConUsuario } from '../soporte/db'
import { almacenComo } from '../soporte/almacen'
import { BUCKET_EXPEDIENTES } from '../../src/supabase/almacen'
import { abrirExpediente, camposVigentes, recalcularCompletitud } from '../../src/persistencia/expediente'
import { registrarDocumento } from '../../src/persistencia/documentos'
import { calcularCompletitud, type CampoExpediente } from '../../src/dominio/expediente'
import { enTransaccionDeSesion, type ContextoSesion } from '../../src/persistencia/transaccion'

/** El día siguiente a la entrada en vigor del Acuerdo. */
const CON_REGLA = '2026-12-01'
/** Un día antes de que entre. */
const SIN_REGLA = '2026-11-29'

/**
 * El comprobante de domicilio caduca.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * LA FUENTE
 * ────────────────────────────────────────────────────────────────────────────
 * Art. 21 del Acuerdo 115/2026: los expedientes se verifican al menos una vez
 * al año «SALVO EL DOCUMENTO QUE COMPRUEBE EL DOMICILIO el cual deberá cumplir
 * con una ANTIGÜEDAD NO MAYOR A TRES MESES».
 *
 * Vive en el Capítulo III y ningún transitorio lo exceptúa, así que entra con
 * la vigencia general: **30 de noviembre de 2026**. El issue #11 decía «1 de
 * marzo de 2027» y se equivocaba por tres meses y medio — un error que no
 * revienta, solo deja pasar comprobantes viejos en silencio.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * EL DEFECTO QUE IMPIDE
 * ────────────────────────────────────────────────────────────────────────────
 * `documentos.created_at` dice cuándo se SUBIÓ el archivo. Un recibo de luz de
 * 2019 escaneado hoy tenía `created_at` de hoy y cubría el requisito. El
 * expediente salía completo, de ahí a aprobado, y de ahí a un aviso apoyado en
 * un domicilio de hace siete años.
 */
describe('La antigüedad del comprobante de domicilio', () => {
  let db: Client
  let sesion: ContextoSesion

  beforeAll(async () => {
    db = await conectar()
  })

  afterAll(async () => {
    await db.end()
  })

  describe('la regla es un dato del catálogo, con vigencia', () => {
    let actividadId: string

    beforeAll(async () => {
      const { rows } = await db.query(
        `select id::text from actividades_vulnerables where fraccion = 'V_BIS'`,
      )
      actividadId = (rows[0] as { id: string }).id
    })

    const comprobante = async (fecha: string): Promise<CampoExpediente | undefined> =>
      (await camposVigentes(db, actividadId, 'moral', fecha)).find(
        (c) => c.campo === 'comprobante_domicilio',
      )

    it('el 29 de noviembre de 2026 el catálogo todavía NO la exige', async () => {
      // Que la regla no aplique antes de su vigencia no es un detalle: si
      // aplicara, todos los expedientes ya integrados quedarían incompletos de
      // golpe por una exigencia que aún no existe.
      expect((await comprobante(SIN_REGLA))?.antiguedadMaximaMeses).toBeUndefined()
    })

    it('el 30 de noviembre de 2026 sí, y son tres meses', async () => {
      expect((await comprobante('2026-11-30'))?.antiguedadMaximaMeses).toBe(3)
    })

    it('y sigue siendo obligatorio: la vigencia nueva no perdió nada del campo', async () => {
      // Al cerrar una vigencia y abrir otra se copia la fila entera. Si algo se
      // quedara en el camino —el `obligatorio`, la etiqueta— el campo dejaría
      // de contar y la completitud subiría sola.
      const antes = await comprobante(SIN_REGLA)
      const despues = await comprobante('2026-11-30')

      expect(despues?.obligatorio).toBe(true)
      expect(despues?.etiqueta).toBe(antes?.etiqueta)
      expect(despues?.orden).toBe(antes?.orden)
      expect(despues?.tipoDato).toBe('documento')
    })
  })

  describe('la frontera exacta, en meses de calendario', () => {
    const campo: CampoExpediente = {
      campo: 'comprobante_domicilio',
      etiqueta: 'Comprobante de domicilio',
      tipoDato: 'documento',
      obligatorio: true,
      antiguedadMaximaMeses: 3,
      orden: 10,
    }

    const evaluar = (emision: string | null, hoy: string) =>
      calcularCompletitud([campo], {}, new Map([['comprobante_domicilio', { fechaEmision: emision }]]), hoy)

    it('el último día de la ventana todavía cumple', () => {
      // Emitido el 1 de diciembre, sirve hasta el 1 de marzo inclusive.
      expect(evaluar('2026-12-01', '2027-03-01').estatus).toBe('completo')
    })

    it('un día después, no', () => {
      const r = evaluar('2026-12-01', '2027-03-02')
      expect(r.estatus).toBe('incompleto')
      expect(r.faltantes[0]?.motivo).toBe('vencido')
    })

    it('se cuenta en MESES, no en noventa días', () => {
      // De 30-nov a 28-feb hay 90 días en año no bisiesto, pero son tres meses
      // de calendario y la Ley dice meses. Con «90 días» este caso saldría
      // vencido el 28 de febrero, y no lo está.
      expect(evaluar('2026-11-30', '2027-02-28').estatus).toBe('completo')
    })

    it('el desbordamiento de día se resuelve hacia atrás, no hacia adelante', () => {
      // 31 de marzo + 3 meses: junio no tiene 31. El límite es el 30 de junio.
      // Rodar al 1 de julio alargaría la ventana un día, y alargarla es la
      // dirección que produce incumplimiento.
      expect(evaluar('2027-03-31', '2027-06-30').estatus).toBe('completo')
      expect(evaluar('2027-03-31', '2027-07-01').estatus).toBe('incompleto')
    })

    it('sin fecha de emisión NO se da por bueno: no se sabe', () => {
      // REGLA DURA 6. El documento existe; si cumple o no, se ignora. Darlo por
      // válido sería el fallback razonable que este proyecto no se permite.
      const r = evaluar(null, '2027-03-01')
      expect(r.estatus).toBe('incompleto')
      expect(r.faltantes[0]?.motivo).toBe('sin_fecha_emision')
    })

    it('y un campo SIN regla de antigüedad se sigue comportando igual que siempre', () => {
      // La regla nueva no puede volver incompletos los documentos que el
      // catálogo no acota. Sin `antiguedadMaximaMeses`, tenerlo basta.
      const sinRegla: CampoExpediente = { ...campo, antiguedadMaximaMeses: undefined }
      const r = calcularCompletitud(
        [sinRegla],
        {},
        new Map([['comprobante_domicilio', { fechaEmision: null }]]),
        '2030-01-01',
      )
      expect(r.estatus).toBe('completo')
    })
  })

  describe('contra la base', () => {
    let expedienteId: string

    beforeEach(async () => {
      const marca = String(Date.now()).slice(-6) + String(Math.floor(Math.random() * 900) + 100)
      sesion = await crearTenantConUsuario(db, marca, 'admin')

      await db.query(
        `insert into actividades_tenant (tenant_id, actividad_id)
         select $1, id from actividades_vulnerables where fraccion = 'V_BIS'`,
        [sesion.tenantId],
      )
      const c = await db.query(
        `insert into clientes_finales (tenant_id,tipo_persona,rfc,nombre_o_razon_social,nacionalidad)
         values ($1,'moral',$2,'Compradora SA','MX') returning id::text`,
        [sesion.tenantId, `CMP${marca}`],
      )
      const r = await abrirExpediente(db, {
        sesion,
        clienteId: (c.rows[0] as { id: string }).id,
      })
      expedienteId = r.expedienteId
    })

    let bytes = 0

    const subir = async (
      fechaEmision?: string,
      reemplazaA?: string,
    ): Promise<string> => {
      // Bytes distintos en cada llamada: dos documentos idénticos tendrían el
      // mismo hash y la misma ruta, y el reemplazo dejaría de distinguirse.
      bytes += 1
      const r = await registrarDocumento(db, almacenComo(sesion, BUCKET_EXPEDIENTES), {
        sesion,
        expedienteId,
        documento: {
          campo: 'comprobante_domicilio',
          nombreArchivo: 'recibo.pdf',
          mime: 'application/pdf',
          bytes: new Uint8Array([1, 2, 3, bytes]),
        },
        ...(fechaEmision === undefined ? {} : { fechaEmision }),
        ...(reemplazaA === undefined ? {} : { reemplazaA }),
      })
      return r.documentoId
    }

    const motivoDelComprobante = async (fecha: string): Promise<string | undefined> => {
      const r = await recalcularCompletitud(db, { sesion, expedienteId, fecha })
      return r.faltantes.find((f) => f.campo === 'comprobante_domicilio')?.motivo
    }

    it('un comprobante viejo pasaba antes y ya no pasa', async () => {
      // EL CASO DEL ISSUE, de punta a punta. Se sube HOY un recibo emitido en
      // 2019: `created_at` es de hoy y `fecha_emision` es de hace años.
      await subir('2019-05-10')

      // Antes de la vigencia, el catálogo no exige nada y el documento cubre.
      expect(await motivoDelComprobante(SIN_REGLA)).toBeUndefined()

      // Desde el 30 de noviembre, el mismo documento deja de cubrir.
      expect(await motivoDelComprobante(CON_REGLA)).toBe('vencido')
    })

    it('subirlo sin fecha lo deja «sin fecha de emisión», no cubierto', async () => {
      await subir()
      expect(await motivoDelComprobante(CON_REGLA)).toBe('sin_fecha_emision')
    })

    it('el REEMPLAZO es el que cuenta, no el que estaba', async () => {
      // Se reemplaza un comprobante vencido por otro sin fecha: el motivo
      // cambia, que es la prueba de que el documento vigente es el nuevo. Si el
      // reemplazado siguiera contando, el motivo seguiría siendo 'vencido'.
      const viejo = await subir('2019-05-10')
      expect(await motivoDelComprobante(CON_REGLA)).toBe('vencido')

      await subir(undefined, viejo)
      expect(await motivoDelComprobante(CON_REGLA)).toBe('sin_fecha_emision')
    })

    it('con dos comprobantes vigentes gana el más reciente', async () => {
      // Nada obliga a reemplazar: se puede subir otro sin más. Entre dos
      // vigentes, el que decide es el de emisión más nueva — la lectura que
      // favorece al obligado sin inventar nada.
      await subir('2019-05-10')
      await subir('2021-07-01')

      const r = await recalcularCompletitud(db, { sesion, expedienteId, fecha: CON_REGLA })
      const faltante = r.faltantes.find((f) => f.campo === 'comprobante_domicilio')

      // Los dos están vencidos al 2026, así que lo que se comprueba aquí es que
      // NO gana el de fecha nula ni el primero por orden de inserción: el
      // motivo es 'vencido' y no 'sin_fecha_emision'.
      expect(faltante?.motivo).toBe('vencido')
    })

    /*
     * EL CASO QUE HOY NO SE PUEDE ESCRIBIR, y por qué se dice en vez de fingirlo.
     *
     * «Un comprobante reciente cumple» no es expresable contra la base el 15 de
     * agosto de 2026: la regla entra el 30 de noviembre, y un documento emitido
     * hoy —lo más nuevo que la base acepta, porque el CHECK prohíbe el futuro—
     * ya tendrá tres meses y medio para entonces. No es una limitación del
     * código: es el calendario.
     *
     * La frontera exacta sí está cubierta, arriba, contra la función pura, donde
     * las fechas son parámetros y no dependen del reloj. A partir del 30 de
     * agosto de 2026 este caso se vuelve escribible contra la base.
     */

    it('la base rechaza un documento emitido en el futuro', async () => {
      const manana = new Date()
      manana.setUTCDate(manana.getUTCDate() + 1)

      await expect(subir(manana.toISOString().slice(0, 10))).rejects.toThrow()
    })

    it('y rechaza una fecha que no es una fecha', async () => {
      await expect(
        enTransaccionDeSesion(db, sesion, async () => {
          await subir('ayer por la tarde')
        }),
      ).rejects.toThrow()
    })
  })
})
