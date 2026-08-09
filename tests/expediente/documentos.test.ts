import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { Client } from 'pg'
import { randomBytes } from 'node:crypto'
import { conectar, crearTenantConUsuario } from '../soporte/db'
import { almacenComo } from '../soporte/almacen'
import { registrarDocumento, FalloDeAlmacen, type AlmacenDocumentos } from '../../src/persistencia/documentos'
import {
  DocumentoInvalido,
  MIMES_PERMITIDOS,
  calcularHash,
  prepararDocumento,
  rutaDocumento,
} from '../../src/dominio/documentos'
import type { ContextoSesion } from '../../src/persistencia/transaccion'

/**
 * El expediente documental contra Storage real.
 *
 * No se usa un doble de Storage salvo donde se prueba el fallo: lo que hay que
 * demostrar es que el archivo que baja es byte por byte el que subió, y eso un
 * doble en memoria lo cumple por construcción sin probar nada.
 */
describe('Documentos del expediente', () => {
  let db: Client
  let sesion: ContextoSesion
  let expedienteId: string
  let almacen: AlmacenDocumentos

  beforeAll(async () => {
    db = await conectar()
  })

  afterAll(async () => {
    await db.end()
  })

  beforeEach(async () => {
    const marca = String(Date.now()).slice(-6) + String(Math.floor(Math.random() * 900) + 100)
    sesion = await crearTenantConUsuario(db, marca)
    almacen = almacenComo(sesion)
    expedienteId = await crearExpediente(db, sesion, marca)
  })

  const pdf = (contenido: Uint8Array) => ({
    campo: 'identificacion_oficial',
    nombreArchivo: 'ine.pdf',
    mime: 'application/pdf',
    bytes: contenido,
  })

  describe('ida y vuelta del hash', () => {
    it('el archivo que baja de Storage es byte por byte el que subió', async () => {
      // Bytes ALEATORIOS, no texto: un archivo de texto sobrevive a una
      // reencodificación accidental y el test pasaría sin probar nada. Con
      // bytes binarios, cualquier transformación cambia el hash.
      const original = new Uint8Array(randomBytes(64 * 1024))

      const r = await registrarDocumento(db, almacen, {
        sesion,
        expedienteId,
        documento: pdf(original),
      })

      const bajado = await almacen.descargar(r.ruta)

      expect(bajado.byteLength).toBe(original.byteLength)
      expect(Buffer.compare(Buffer.from(bajado), Buffer.from(original))).toBe(0)
      expect(calcularHash(bajado)).toBe(r.hash)
    })

    it('el hash guardado en la base es el del archivo descargado, no el de otra cosa', async () => {
      const original = new Uint8Array(randomBytes(4096))
      const r = await registrarDocumento(db, almacen, {
        sesion,
        expedienteId,
        documento: pdf(original),
      })

      const { rows } = await db.query(
        `select hash_sha256, tamano_bytes::int, storage_path, mime
           from documentos where id = $1`,
        [r.documentoId],
      )
      const fila = rows[0] as {
        hash_sha256: string
        tamano_bytes: number
        storage_path: string
        mime: string
      }

      expect(calcularHash(await almacen.descargar(fila.storage_path))).toBe(fila.hash_sha256)
      expect(fila.tamano_bytes).toBe(original.byteLength)
      expect(fila.mime).toBe('application/pdf')
    })

    it('dos archivos distintos por un solo byte tienen hash distinto', async () => {
      const a = new Uint8Array([1, 2, 3, 4, 5])
      const b = new Uint8Array([1, 2, 3, 4, 6])
      expect(calcularHash(a)).not.toBe(calcularHash(b))
    })
  })

  describe('la ruta aísla a un obligado de otro', () => {
    it('el tenant va primero: es lo que lee la política de Storage', () => {
      const ruta = rutaDocumento(
        '00000000-0000-4000-8000-000000000001',
        '00000000-0000-4000-8000-000000000002',
        '00000000-0000-4000-8000-000000000003',
      )
      expect(ruta.split('/')[0]).toBe('00000000-0000-4000-8000-000000000001')
    })

    it('la política real de storage.objects lee ese mismo primer segmento', async () => {
      // Si alguien cambia la convención de ruta y olvida la política —o al
      // revés— el aislamiento se rompe en silencio. Esto los ata.
      const { rows } = await db.query(
        `select qual::text as q from pg_policies
          where schemaname='storage' and tablename='objects' and cmd='SELECT'`,
      )
      expect((rows[0] as { q: string }).q).toContain('storage.foldername(name))[1]')
      expect((rows[0] as { q: string }).q).toContain('tenant_id()')
    })

    it('un obligado no puede descargar el archivo de otro', async () => {
      const original = new Uint8Array(randomBytes(512))
      const r = await registrarDocumento(db, almacen, {
        sesion,
        expedienteId,
        documento: pdf(original),
      })

      // CONTROL, en el mismo test: el dueño SÍ puede bajar esta ruta exacta.
      // Sin esto, un fallo de configuración de Storage haría pasar la parte de
      // abajo sin que nada estuviera aislado — el modo de falla que encontró
      // la auditoría de la semana 1.
      expect(await almacen.descargar(r.ruta)).toHaveLength(original.byteLength)

      const ajena = await crearTenantConUsuario(
        db,
        String(Date.now()).slice(-6) + String(Math.floor(Math.random() * 900) + 100),
      )
      await expect(almacenComo(ajena).descargar(r.ruta)).rejects.toThrow()
    })

    it('rechaza armar una ruta con un id que no es UUID', () => {
      expect(() => rutaDocumento('../otro-tenant', 'exp', 'doc')).toThrow(DocumentoInvalido)
    })
  })

  describe('lo que no debe entrar', () => {
    it('un archivo de cero bytes no es evidencia', () => {
      expect(() => prepararDocumento(pdf(new Uint8Array(0)))).toThrow(/vacío/)
    })

    it('la base TAMBIÉN lo impide, no solo el dominio', async () => {
      // Nivel 2 de CLAUDE.md: un INSERT que no pase por prepararDocumento
      // tampoco puede dejar un documento de cero bytes.
      await expect(
        db.query(
          `insert into documentos (tenant_id, expediente_id, campo, storage_path,
                                   hash_sha256, tamano_bytes, mime)
           values ($1,$2,'identificacion_oficial','ruta/falsa/1',$3,0,'application/pdf')`,
          [sesion.tenantId, expedienteId, 'a'.repeat(64)],
        ),
      ).rejects.toThrow(/tamano_positivo/)
    })

    it('la base rechaza un hash que no es SHA-256 hexadecimal', async () => {
      await expect(
        db.query(
          `insert into documentos (tenant_id, expediente_id, campo, storage_path,
                                   hash_sha256, tamano_bytes, mime)
           values ($1,$2,'identificacion_oficial','ruta/falsa/2',$3,10,'application/pdf')`,
          [sesion.tenantId, expedienteId, 'A'.repeat(64)], // mayúsculas
        ),
      ).rejects.toThrow(/hash_es_sha256_hex/)
    })

    it('rechaza un tipo de archivo que el bucket no acepta', () => {
      expect(() =>
        prepararDocumento({ ...pdf(new Uint8Array([1])), mime: 'application/zip' }),
      ).toThrow(/no se acepta/)
    })

    it('la lista de MIME del código y la del bucket son la misma', async () => {
      // Si divergen, un archivo pasa una validación y muere en la otra con un
      // error de Storage que no dice qué hacer.
      const { rows } = await db.query(
        `select allowed_mime_types from storage.buckets where id = 'expedientes'`,
      )
      const delBucket = (rows[0] as { allowed_mime_types: string[] }).allowed_mime_types
      expect([...delBucket].sort()).toEqual([...MIMES_PERMITIDOS].sort())
    })
  })

  describe('cuando Storage falla', () => {
    it('no queda fila en la base ni evento en la bitácora', async () => {
      const almacenRoto: AlmacenDocumentos = {
        subir: () => Promise.reject(new Error('disco lleno')),
        descargar: () => Promise.reject(new Error('no aplica')),
      }

      await expect(
        registrarDocumento(db, almacenRoto, {
          sesion,
          expedienteId,
          documento: pdf(new Uint8Array([1, 2, 3])),
        }),
      ).rejects.toThrow(FalloDeAlmacen)

      const { rows } = await db.query(
        `select (select count(*) from documentos where tenant_id=$1)::int as d,
                (select count(*) from bitacora where tenant_id=$1 and evento='documento.alta')::int as b`,
        [sesion.tenantId],
      )
      expect(rows[0]).toEqual({ d: 0, b: 0 })
    })
  })

  describe('la bitácora del documento', () => {
    it('registra el hash pero NUNCA el nombre del archivo', async () => {
      const r = await registrarDocumento(db, almacen, {
        sesion,
        expedienteId,
        documento: { ...pdf(new Uint8Array(randomBytes(256))), nombreArchivo: 'INE-Juan-Perez.pdf' },
      })

      const { rows } = await db.query(
        `select datos::text as d from bitacora
          where tenant_id=$1 and evento='documento.alta'`,
        [sesion.tenantId],
      )
      const datos = (rows[0] as { d: string }).d

      // El hash sí: es lo que permite demostrar que el archivo no cambió.
      expect(datos).toContain(r.hash)
      // El nombre no: es dato personal y la bitácora se conserva diez años.
      expect(datos).not.toContain('Juan')
      expect(datos).not.toContain('Perez')
      expect(datos).not.toContain('.pdf')
    })
  })
  describe('integridad del documento (auditoría de la semana 6)', () => {
    /**
     * Tres bugs con la misma raíz: `registrarDocumento` guardaba `campo` y
     * `reemplaza_a` sin contrastarlos con nada. Los tres dejaban el expediente
     * en un estado plausible y equivocado, sin lanzar nada.
     */
    it('un campo con TYPO se rechaza, en vez de guardarse y no contar nunca', async () => {
      await expect(
        registrarDocumento(db, almacen, {
          sesion,
          expedienteId,
          documento: { ...pdf(new Uint8Array([1, 2, 3])), campo: 'identificacion_oficia' },
        }),
      ).rejects.toThrow(/no existe en el catálogo/)
    })

    it('el mensaje dice cuáles SÍ son válidos', async () => {
      await registrarDocumento(db, almacen, {
        sesion, expedienteId,
        documento: { ...pdf(new Uint8Array([9])), campo: 'inventado' },
      }).catch((e: Error) => {
        expect(e.message).toContain('acta_constitutiva')
        expect(e.message).toContain('identificacion_oficial')
      })
    })

    it('un reemplazo no puede cruzar de campo: descubriría el anterior', async () => {
      const ine = await registrarDocumento(db, almacen, {
        sesion, expedienteId, documento: pdf(new Uint8Array(randomBytes(64))),
      })
      await expect(
        registrarDocumento(db, almacen, {
          sesion,
          expedienteId,
          documento: { ...pdf(new Uint8Array(randomBytes(64))), campo: 'comprobante_domicilio' },
          reemplazaA: ine.documentoId,
        }),
      ).rejects.toThrow(/MISMO campo/)
    })

    it('un reemplazo no puede cruzar de expediente: tocaría al cliente equivocado', async () => {
      const otro = await crearExpediente(
        db, sesion, String(Date.now()).slice(-6) + String(Math.floor(Math.random() * 900) + 100),
      )
      const ajeno = await registrarDocumento(db, almacen, {
        sesion, expedienteId: otro, documento: pdf(new Uint8Array(randomBytes(64))),
      })

      await expect(
        registrarDocumento(db, almacen, {
          sesion, expedienteId, documento: pdf(new Uint8Array(randomBytes(64))),
          reemplazaA: ajeno.documentoId,
        }),
      ).rejects.toThrow(/OTRO expediente/)
    })

    it('y la BASE lo impide aunque alguien no pase por registrarDocumento', async () => {
      // Nivel 2 de CLAUDE.md: la precondición de arriba es para el mensaje; esto
      // es lo que protege si mañana otra función escribe en la tabla.
      const ine = await registrarDocumento(db, almacen, {
        sesion, expedienteId, documento: pdf(new Uint8Array(randomBytes(64))),
      })
      await expect(
        db.query(
          `insert into documentos (tenant_id, expediente_id, campo, storage_path,
                                   hash_sha256, tamano_bytes, mime, reemplaza_a)
           values ($1,$2,'comprobante_domicilio','ruta/cruzada/1',$3,10,'application/pdf',$4)`,
          [sesion.tenantId, expedienteId, 'b'.repeat(64), ine.documentoId],
        ),
      ).rejects.toThrow(/documentos_reemplaza_mismo_campo/)
    })

    it('un documento no puede reemplazarse a sí mismo', async () => {
      const { rows } = await db.query('select gen_random_uuid() as id')
      const id = (rows[0] as { id: string }).id
      await expect(
        db.query(
          `insert into documentos (id, tenant_id, expediente_id, campo, storage_path,
                                   hash_sha256, tamano_bytes, mime, reemplaza_a)
           values ($1,$2,$3,'identificacion_oficial','ruta/propia/1',$4,10,'application/pdf',$1)`,
          [id, sesion.tenantId, expedienteId, 'c'.repeat(64)],
        ),
      ).rejects.toThrow(/no_se_reemplaza_a_si_mismo/)
    })
  })

})

async function crearExpediente(
  db: Client,
  sesion: ContextoSesion,
  marca: string,
): Promise<string> {
  const c = await db.query(
    `insert into clientes_finales (tenant_id, tipo_persona, rfc, nombre_o_razon_social)
     values ($1,'moral',$2,'Cliente del expediente') returning id`,
    [sesion.tenantId, `EXP${marca}`],
  )
  const clienteId = (c.rows[0] as { id: string }).id

  const e = await db.query(
    `insert into expedientes (tenant_id, cliente_id, actividad_id)
     select $1, $2, id from actividades_vulnerables where fraccion='V_BIS'
     returning id`,
    [sesion.tenantId, clienteId],
  )
  return (e.rows[0] as { id: string }).id
}
