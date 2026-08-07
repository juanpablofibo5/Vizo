import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { Client } from 'pg'
import { conectar } from '../soporte/db'
import { FaltaBeneficiario, altaCliente } from '../../src/persistencia/clientes'
import { DatosDeClienteInvalidos } from '../../src/dominio/clientes'

describe('Alta de clientes contra la base', () => {
  let db: Client
  let tenantId: string
  let marca: string

  beforeAll(async () => {
    db = await conectar()
  })

  afterAll(async () => {
    await db.end()
  })

  beforeEach(async () => {
    // RFC moral válido: 3 letras + 6 dígitos + 3 alfanuméricos (patrón del XSD).
    marca = String(Date.now()).slice(-6) + String(Math.floor(Math.random() * 900) + 100)
    const t = await db.query(
      `insert into tenants (rfc, razon_social) values ($1,'Alta SA') returning id`,
      [`ALT${marca}`],
    )
    tenantId = (t.rows[0] as { id: string }).id
  })

  const pm = () => ({
    tipoPersona: 'moral' as const,
    nombreORazonSocial: 'Desarrollos Península SA de CV',
    rfc: `DPE${marca}`,
    nacionalidad: 'MX',
  })

  it('da de alta una persona moral con su beneficiario controlador', async () => {
    const r = await altaCliente(db, {
      tenantId,
      datos: pm(),
      beneficiarios: [
        {
          nombre: 'María Fernández Solís',
          participacionPct: 60,
          controlPor: 'participacion',
          esDeclaracion: false,
        },
      ],
    })

    expect(r.clienteId).toBeTruthy()
    expect(r.beneficiarioIds).toHaveLength(1)
    expect(r.requiereRevisionIdentidad).toBe(false)

    const { rows } = await db.query(
      `select c.tipo_persona::text, c.rfc, c.nombre_normalizado,
              b.participacion_pct::text, b.control_por::text
         from clientes_finales c
         join beneficiarios_controladores b on b.cliente_id = c.id
        where c.id = $1`,
      [r.clienteId],
    )
    const f = rows[0] as Record<string, string>
    expect(f['tipo_persona']).toBe('moral')
    expect(f['nombre_normalizado']).toBe('DESARROLLOS PENINSULA SA DE CV')
    expect(f['participacion_pct']).toBe('60.00')
  })

  it('el alta queda en la bitácora, encadenada', async () => {
    const r = await altaCliente(db, { tenantId, datos: pm(), beneficiarios: [decl()] })

    const { rows } = await db.query(
      `select evento, objeto_tipo, objeto_id, datos, secuencia
         from bitacora where tenant_id = $1 order by secuencia`,
      [tenantId],
    )
    const eventos = rows as Array<Record<string, unknown>>
    expect(eventos.map((e) => e['evento'])).toEqual(['cliente.alta', 'beneficiario.alta'])
    expect(eventos[0]?.['objeto_id']).toBe(r.clienteId)

    // La cadena tiene que estar íntegra después de escribir.
    const v = await db.query(`select * from app.bitacora_verificar($1)`, [tenantId])
    expect(v.rows).toHaveLength(0)
  })

  it('REGLA 3: la bitácora no guarda datos personales', async () => {
    const r = await altaCliente(db, {
      tenantId,
      datos: pm(),
      beneficiarios: [
        { nombre: 'María Fernández Solís', controlPor: 'control_efectivo', esDeclaracion: false },
      ],
    })

    const { rows } = await db.query(
      `select datos::text as d from bitacora where tenant_id = $1`,
      [tenantId],
    )
    const todo = rows.map((x) => (x as { d: string }).d).join(' ')

    // Ni el nombre, ni el RFC, ni la razón social pueden aparecer.
    expect(todo).not.toContain('María')
    expect(todo).not.toContain('Península')
    expect(todo).not.toContain(`DPE${marca}`)
    // Sí van los IDs opacos y los metadatos no personales.
    expect(todo).toContain(r.clienteId)
    expect(todo).toContain('moral')
  })

  it('una persona moral SIN beneficiario no se da de alta', async () => {
    await expect(altaCliente(db, { tenantId, datos: pm(), beneficiarios: [] })).rejects.toThrow(
      FaltaBeneficiario,
    )

    // Y no dejó basura: la transacción no llegó a abrirse.
    const { rows } = await db.query(
      `select count(*)::int as n from clientes_finales where tenant_id = $1`,
      [tenantId],
    )
    expect((rows[0] as { n: number }).n).toBe(0)
  })

  it('un RFC inválido no toca la base', async () => {
    await expect(
      altaCliente(db, {
        tenantId,
        datos: { ...pm(), rfc: 'ESTO-NO-ES-UN-RFC' },
        beneficiarios: [decl()],
      }),
    ).rejects.toThrow(DatosDeClienteInvalidos)

    const { rows } = await db.query(
      `select count(*)::int as n from bitacora where tenant_id = $1`,
      [tenantId],
    )
    expect((rows[0] as { n: number }).n).toBe(0)
  })

  it('si falla a mitad, no queda cliente sin bitácora ni bitácora sin cliente', async () => {
    // Un beneficiario con participación imposible pasa la validación de
    // dominio del cliente pero revienta el CHECK de la base.
    await expect(
      db.query(
        `insert into beneficiarios_controladores (tenant_id, cliente_id, nombre, participacion_pct, control_por, es_declaracion)
         values ($1, gen_random_uuid(), 'X', 500, 'participacion', false)`,
        [tenantId],
      ),
    ).rejects.toThrow()

    const { rows } = await db.query(
      `select (select count(*) from clientes_finales where tenant_id=$1)::int as c,
              (select count(*) from bitacora where tenant_id=$1)::int as b`,
      [tenantId],
    )
    const f = rows[0] as { c: number; b: number }
    expect(f.c).toBe(0)
    expect(f.b).toBe(0)
  })

  it('el extranjero sin RFC queda marcado y con su evento propio', async () => {
    const r = await altaCliente(db, {
      tenantId,
      datos: {
        tipoPersona: 'fisica',
        nombreORazonSocial: 'John Smith',
        nombrePila: 'John',
        apellidoPaterno: 'Smith',
        nacionalidad: 'US',
        identidadAlterna: { tipo_doc: 'pasaporte', numero: 'US987654321', pais: 'US' },
      },
    })

    expect(r.requiereRevisionIdentidad).toBe(true)

    const { rows } = await db.query(
      `select evento, datos::text as d from bitacora where tenant_id=$1 order by secuencia`,
      [tenantId],
    )
    const eventos = rows as Array<{ evento: string; d: string }>
    expect(eventos.map((e) => e.evento)).toContain('cliente.identidad_marcada')
    // El tipo de documento sí es útil para auditar; el NÚMERO es dato personal.
    expect(eventos.some((e) => e.d.includes('pasaporte'))).toBe(true)
    expect(eventos.some((e) => e.d.includes('US987654321'))).toBe(false)
  })

  const decl = () => ({
    nombre: '',
    controlPor: 'control_efectivo' as const,
    esDeclaracion: true,
  })
})
