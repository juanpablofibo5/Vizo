import Link from 'next/link'
import { Client } from 'pg'
import { sesionRequerida } from '../../../../src/supabase/sesion'
import type { Completitud } from '../../../../src/dominio/expediente'
import { abrir } from './acciones'
import { FormularioSubida } from './subir'

export const dynamic = 'force-dynamic'

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
      `select id, nombre_o_razon_social, tipo_persona::text as tipo_persona, rfc
         from clientes_finales where id = $1`,
      [clienteId],
    )
    if (cli.rows.length === 0) {
      return (
        <Marco nombre={sesion.nombre} rol={sesion.rol}>
          <p className="error">Este cliente no existe en tu obligado.</p>
        </Marco>
      )
    }
    const cliente = cli.rows[0] as {
      nombre_o_razon_social: string
      tipo_persona: string
      rfc: string | null
    }

    const exp = await db.query(
      `select id, estatus::text as estatus, actividad_id, completitud
         from expedientes where cliente_id = $1 order by version desc limit 1`,
      [clienteId],
    )

    if (exp.rows.length === 0) {
      const abrirEste = abrir.bind(null, clienteId)
      return (
        <Marco nombre={sesion.nombre} rol={sesion.rol}>
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
    await db.query('rollback')

    const faltantes = evaluado ? completitud.faltantes : []
    const etiquetas = new Map(
      (etiquetasRows.rows as Array<{ campo: string; etiqueta: string }>).map((r) => [
        r.campo,
        r.etiqueta,
      ]),
    )
    const pendientesDocumentales = faltantes
      .filter((f) => f.tipoDato === 'documento')
      .map((f) => ({ campo: f.campo, etiqueta: f.etiqueta }))
    const faltantesDeDato = faltantes.filter((f) => f.tipoDato !== 'documento')

    return (
      <Marco nombre={sesion.nombre} rol={sesion.rol}>
        <h1>{cliente.nombre_o_razon_social}</h1>
        <p className="sub">
          {cliente.tipo_persona === 'fisica' ? 'Persona física' : 'Persona moral'} ·{' '}
          {cliente.rfc ?? 'sin RFC'} ·{' '}
          <span className="chip">{evaluado ? completitud.estatus : 'sin evaluar'}</span>{' '}
          {evaluado
            ? `${completitud.cubiertos} de ${completitud.totalObligatorios} requisitos`
            : 'la completitud aún no se ha calculado'}
        </p>

        {faltantesDeDato.length > 0 && (
          <div className="aviso">
            <strong>Faltan datos de captura</strong> (no se resuelven subiendo un archivo):{' '}
            {faltantesDeDato.map((f) => f.etiqueta).join(', ')}.
          </div>
        )}

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
                  <td>{(Number(d.tamano_bytes) / 1024).toFixed(0)} KB</td>
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

        <Link href="/clientes">← Volver a clientes</Link>
      </Marco>
    )
  } finally {
    await db.end()
  }
}

function Marco({
  nombre,
  rol,
  children,
}: {
  nombre: string
  rol: string
  children: React.ReactNode
}) {
  return (
    <>
      <header className="barra">
        <strong>VIZO</strong>
        <span>
          {nombre}
          <span className="chip">{rol}</span>
        </span>
      </header>
      <main>{children}</main>
    </>
  )
}
