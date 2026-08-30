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
import { SeccionPep } from './pep'
import { estadoPepDelCliente, type EstadoPep } from '../../../../src/persistencia/pep'
import { SeccionRiesgoCliente } from './riesgo'
import { SeccionPerfilTransaccional } from './perfil'
import { SeccionAprobacionDirectivo } from './aprobacion'
import { riesgoDelCliente, type RiesgoDelCliente } from '../../../../src/persistencia/riesgo'
import { estadoDelPerfil, type EstadoPerfil } from '../../../../src/persistencia/perfil'
import {
  estadoDeAprobacion,
  type EstadoAprobacion,
} from '../../../../src/persistencia/aprobacion'
import { ConocimientoDelCliente, type SeccionDeConocimiento } from './conocimiento'
import { SeccionCuestionario } from './cuestionario'
import { SeccionMedidasReforzadas } from './reforzadas'
import {
  estadoDeMedidasReforzadas,
  type EstadoDeMedidas,
} from '../../../../src/persistencia/medidas-reforzadas'
import {
  estadoDelCuestionario,
  type EstadoDelCuestionario,
} from '../../../../src/persistencia/cuestionario'
import { SeccionScreening } from './screening'
import {
  coincidenciasPendientes,
  listasVigentes,
  screeningDelSujeto,
  type ConsultaListada,
  type ConsultaPendiente,
} from '../../../../src/persistencia/screening'
import { ListasIncompletas, type ListaVigente } from '../../../../src/dominio/screening'
import {
  rielAprobacion,
  rielGradoDeRiesgo,
  rielPep,
  rielPerfil,
  rielCuestionario,
  rielMedidasReforzadas,
  rielRevisionAnual,
  seccionAbiertaPorDefecto,
  SECCIONES_DEL_CONOCIMIENTO,
} from '../../../componentes/riel'

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

    /*
      EL SCREENING VA ANTES DE LA PUERTA, a propósito.

      Las siete secciones de conocimiento se asientan EN el expediente, y por
      eso la puerta del ADR-24 las condiciona. El screening no: consultar a una
      persona contra listas de control es lo que se hace ANTES de decidir si se
      abre relación con ella, y la coincidencia sin resolver es urgente exista
      o no expediente.

      La primera versión de esta pantalla lo dejó dentro de la puerta, y el
      resultado se vio en la demo: un cliente con coincidencia detectada y sin
      expediente tenía su alerta en /alertas diciendo «se resuelve en su
      expediente», y el expediente ofrecía un botón de abrir y nada más. La
      alerta apuntaba a una pantalla sin la acción que prometía.
    */
    const ctxSesion = {
      usuarioId: sesion.usuarioId,
      tenantId: sesion.tenantId,
      rol: sesion.rol,
    }
    const screening: ConsultaListada[] = await screeningDelSujeto(db, {
      sesion: ctxSesion,
      sujetoTipo: 'cliente',
      sujetoId: clienteId,
    })
    const screeningPendientes: ConsultaPendiente[] = await coincidenciasPendientes(db, {
      sesion: ctxSesion,
      sujetoTipo: 'cliente',
      sujetoId: clienteId,
    })
    // Sin las cuatro listas la consulta se DETIENE (regla dura 6). Aquí ese
    // alto se convierte en un mensaje en pantalla, no en una página rota.
    let listasScreening: ListaVigente[] | null = null
    let listasScreeningError: string | null = null
    try {
      listasScreening = await listasVigentes(db)
    } catch (e) {
      if (!(e instanceof ListasIncompletas)) throw e
      listasScreeningError = e.message
    }

    const seccionScreening = (
      <>
        <h2>Listas de control</h2>
        <p className="sub" style={{ maxWidth: '44rem' }}>
          OFAC, ONU, SAT 69-B y Personas Bloqueadas. VIZO detecta de más a propósito y no
          descarta nada solo: confirmar o descartar una coincidencia lo firma una persona, con su
          razonamiento como evidencia.
        </p>
        <SeccionScreening
          clienteId={clienteId}
          historial={screening}
          pendientes={screeningPendientes}
          listas={listasScreening}
          listasError={listasScreeningError}
          esAdmin={sesion.rol === 'admin'}
        />
      </>
    )

    const exp = await db.query(
      `select e.id, e.estatus::text as estatus, e.actividad_id, e.completitud,
              e.verificado_en::text as verificado_en,
              r.vence::text as vence
         from expedientes e
         left join expedientes_por_reverificar r on r.expediente_id = e.id
        where e.cliente_id = $1 order by e.version desc limit 1`,
      [clienteId],
    )

    /*
      LA PUERTA (ADR-24).
      Sin expediente abierto no se ofrece ninguna de las siete secciones: el
      conocimiento del cliente se asienta EN su expediente, y capturar un
      Grado de Riesgo sobre alguien cuya identificación nadie ha empezado a
      integrar sería construir el segundo piso antes que el primero.
      El ADR pedía que esta pantalla dijera tres cosas —qué se integra, por
      qué precede al resto, y qué se desbloquea— en vez de una línea y un
      botón. Las siete que promete salen de la MISMA lista que el expediente
      pinta, así que no pueden divergir.
    */
    if (exp.rows.length === 0) {
      const abrirEste = abrir.bind(null, clienteId)
      return (
        <Marco obligado={obligado} perfil={sesion}>
          <p className="migaja">
            <Link href="/clientes">← Clientes</Link>
          </p>
          <h1>{cliente.nombre_o_razon_social}</h1>
          <p className="sub">
            {cliente.tipo_persona === 'fisica' ? 'Persona física' : 'Persona moral'} ·{' '}
            <span className="mono">{cliente.rfc ?? 'sin RFC'}</span>
          </p>

          <div className="vacio">
            <h2 className="vacio-titulo">Este cliente todavía no tiene expediente</h2>
            <div className="vacio-cuerpo">
              <p>
                En Fracción V Bis se integra expediente de <strong>cada aportante</strong>, sin
                importar el monto. No es un paso que se pueda posponer hasta que la operación
                sea grande: es la primera obligación, y precede a todas las demás.
              </p>
              <p>
                Abrirlo desbloquea las siete secciones de conocimiento del cliente, cada una
                con su propio reloj:
              </p>
              <ul className="vacio-lista">
                {SECCIONES_DEL_CONOCIMIENTO.map((s) => (
                  <li key={s.id}>
                    {s.titulo} · {s.articulo}
                  </li>
                ))}
              </ul>
            </div>
            <form action={abrirEste}>
              <button type="submit">Abrir expediente</button>
            </form>
          </div>

          {/* Las listas SÍ se consultan aquí: es lo que se hace antes de
              decidir si se abre relación, y una coincidencia detectada no
              espera a que alguien abra el expediente. */}
          {seccionScreening}
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

    // La declaración PEP solo existe para personas físicas: a una moral la
    // base se la niega (la pregunta correcta ahí es el Beneficiario
    // Controlador), así que ni se consulta.
    const estadoPep: EstadoPep | null =
      cliente.tipo_persona === 'fisica'
        ? await estadoPepDelCliente(db, {
            sesion: { usuarioId: sesion.usuarioId, tenantId: sesion.tenantId, rol: sesion.rol },
            clienteId,
            hoy: hoyEnMexico(),
          })
        : null

    const riesgo: RiesgoDelCliente = await riesgoDelCliente(db, {
      sesion: { usuarioId: sesion.usuarioId, tenantId: sesion.tenantId, rol: sesion.rol },
      clienteId,
      hoy: hoyEnMexico(),
    })

    const perfil: EstadoPerfil = await estadoDelPerfil(db, {
      sesion: { usuarioId: sesion.usuarioId, tenantId: sesion.tenantId, rol: sesion.rol },
      clienteId,
      hoy: hoyEnMexico(),
    })

    const cuestionario: EstadoDelCuestionario = await estadoDelCuestionario(db, {
      sesion: { usuarioId: sesion.usuarioId, tenantId: sesion.tenantId, rol: sesion.rol },
      clienteId,
      hoy: hoyEnMexico(),
    })

    const reforzadas: EstadoDeMedidas = await estadoDeMedidasReforzadas(db, {
      sesion: { usuarioId: sesion.usuarioId, tenantId: sesion.tenantId, rol: sesion.rol },
      clienteId,
      hoy: hoyEnMexico(),
    })

    const aprobacion: EstadoAprobacion = await estadoDeAprobacion(db, {
      sesion: { usuarioId: sesion.usuarioId, tenantId: sesion.tenantId, rol: sesion.rol },
      clienteId,
      hoy: hoyEnMexico(),
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


    /**
     * Los estados del riel: presentación pura de lo que la persistencia ya
     * derivó. La sección abierta al cargar es la más grave — si ninguna pide
     * atención, todas amanecen cerradas y el riel cuenta la historia.
     */
    const estadoRevision = rielRevisionAnual({
      relacionNegocios: cliente.relacion_negocios,
      vence: expediente.vence,
      hoy: hoyEnMexico(),
    })
    const estadoRiesgo = rielGradoDeRiesgo(riesgo)
    const estadoPerfil = rielPerfil(perfil)
    const estadoAprobacionRiel = rielAprobacion(aprobacion)
    const estadoPepRiel = rielPep(estadoPep)
    const estadoCuestionario = rielCuestionario(cuestionario)
    const estadoReforzadas = rielMedidasReforzadas(reforzadas)

    const secciones: SeccionDeConocimiento[] = [
      {
        ...SECCIONES_DEL_CONOCIMIENTO[0],
        ...estadoRevision,
        contenido: (
          <SeccionRevisionAnual
            clienteId={clienteId}
            expedienteId={expediente.id}
            relacionNegocios={cliente.relacion_negocios}
            verificadoEn={expediente.verificado_en}
            venceEn={expediente.vence}
            aprobado={expediente.estatus === 'aprobado'}
            puede={sesion.rol === 'admin'}
          />
        ),
      },
      {
        ...SECCIONES_DEL_CONOCIMIENTO[1],
        ...estadoRiesgo,
        contenido: (
          <SeccionRiesgoCliente clienteId={clienteId} riesgo={riesgo} puede={sesion.rol === 'admin'} />
        ),
      },
      {
        ...SECCIONES_DEL_CONOCIMIENTO[2],
        ...estadoPerfil,
        contenido: (
          <SeccionPerfilTransaccional
            clienteId={clienteId}
            perfil={perfil}
            puede={sesion.rol === 'admin'}
          />
        ),
      },
      {
        ...SECCIONES_DEL_CONOCIMIENTO[3],
        ...estadoAprobacionRiel,
        contenido: (
          <SeccionAprobacionDirectivo
            clienteId={clienteId}
            aprobacion={aprobacion}
            puede={sesion.rol === 'admin'}
          />
        ),
      },
      {
        ...SECCIONES_DEL_CONOCIMIENTO[4],
        ...estadoPepRiel,
        contenido:
          estadoPep !== null ? (
            <SeccionPep
              clienteId={clienteId}
              estado={estadoPep}
              esAdmin={sesion.rol === 'admin'}
              hoy={hoyEnMexico()}
            />
          ) : (
            <p className="pequeno tenue" style={{ margin: 0, maxWidth: '42rem' }}>
              La declaración del Art. 23 Quáter es de personas físicas: pregunta por cargos,
              parentescos y socios de una persona. Para una persona moral, la pregunta
              equivalente es quién está detrás — el Beneficiario Controlador del Art. 23
              Quinquies.
            </p>
          ),
      },
      {
        ...SECCIONES_DEL_CONOCIMIENTO[5],
        ...estadoCuestionario,
        contenido: (
          <SeccionCuestionario
            clienteId={clienteId}
            estado={cuestionario}
            puede={sesion.rol === 'admin'}
          />
        ),
      },
      {
        ...SECCIONES_DEL_CONOCIMIENTO[6],
        ...estadoReforzadas,
        contenido: (
          <SeccionMedidasReforzadas
            clienteId={clienteId}
            estado={reforzadas}
            puede={sesion.rol === 'admin'}
          />
        ),
      },
    ]

    return (
      <Marco obligado={obligado} perfil={sesion}>
        <p className="migaja">
          <Link href="/clientes">← Clientes</Link>
        </p>
        <h1>{cliente.nombre_o_razon_social}</h1>
        <p className="sub">
          {cliente.tipo_persona === 'fisica' ? 'Persona física' : 'Persona moral'} ·{' '}
          <span className="mono">{cliente.rfc ?? 'sin RFC'}</span> ·{' '}
          {evaluado
            ? `${completitud.cubiertos} de ${completitud.totalObligatorios} requisitos documentales`
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
          <div className="tarjeta tarjeta-aprobacion">
            <div>
              <h3 style={{ fontSize: '.95rem', margin: '0 0 .3rem' }}>Aprobación del expediente</h3>
              <p className="tenue pequeno" style={{ margin: 0 }}>
                Estar completo es que no falte nada. Aprobarlo es que alguien haya
                comprobado que lo que hay sirve — y esas dos cosas no son la misma.
              </p>
            </div>
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

        {/*
          El orden de las secciones no es estético: la aprobación (04) depende
          del grado (02) y de la declaración PEP (05) — y sin alguno de los dos
          no da «no se requiere» sino el hueco. Las dos últimas (23 Ter 3 y 4)
          existen antes de estar construidas: el patrón es de siete secciones,
          no de las cinco que hay hoy.
        */}
        <h2>Conocimiento del cliente</h2>
        <p className="sub" style={{ maxWidth: '44rem' }}>
          Siete secciones, cada una con su propio reloj. El riel de la izquierda es el
          estado completo; abrir una sección no pierde de vista a las otras seis.
        </p>
        <ConocimientoDelCliente
          secciones={secciones}
          abiertaInicial={seccionAbiertaPorDefecto(secciones)}
        />

        {seccionScreening}

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
        <div className="tabla-envoltura">
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
        </div>

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

        {/* «Volver a clientes» vive arriba, en la migaja. */}
        <p style={{ marginTop: '1.5rem' }}>
          <Link href={`/clientes/${clienteId}/expediente/historico`}>
            ¿Cómo estaba en una fecha? →
          </Link>
        </p>
      </Marco>
    )
  } finally {
    await db.end()
  }
}

