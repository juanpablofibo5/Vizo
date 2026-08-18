import type { EjecutorSql } from '../catalogo/cargador'
import { exigirSesionActiva, type ContextoSesion } from './transaccion'

/**
 * El arranque del obligado.
 *
 * En F1 el onboarding es **asistido**: lo ejecutamos nosotros con el runbook de
 * alta de tenant. Lo que el cliente ve en el portal es este checklist, y existe
 * por una razón que no es cortesía.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * EL DEFECTO QUE ARREGLA
 * ────────────────────────────────────────────────────────────────────────────
 * Un obligado recién dado de alta, sin actividad contratada, abría Inicio y
 * leía **"Todo presentado"**. No es un texto desafortunado: es el sistema
 * afirmando cumplimiento sobre un obligado del que no sabe absolutamente nada.
 * Sin actividad contratada no hay periodos que calcular, la lista de pendientes
 * sale vacía, y "vacío" se estaba pintando como "en regla".
 *
 * En un producto cuyo trabajo es decir si estás en regla, esa es la mentira más
 * cara que puede contar. El arranque distingue los dos vacíos: *todavía no sé*
 * y *no debes nada*.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * QUÉ PASOS SON, Y POR QUÉ ESOS
 * ────────────────────────────────────────────────────────────────────────────
 * Cada paso es una **precondición real de algo que el sistema hace**, no una
 * etapa inventada para que la barra avance. Si un paso falta, algo concreto no
 * funciona; si sobra, no está aquí.
 *
 * Los pasos dependen de lo contratado. Un obligado de arrendamiento (Fr. XV) no
 * tiene desarrollos inmobiliarios que cargar, y pedirle uno sería un paso
 * imposible de completar para siempre. Esa condicional es la misma propiedad
 * que probó la Fr. XV: lo que cambia entre actividades vive en el catálogo, no
 * en el código.
 */

export type ClaveDePaso =
  | 'actividad'
  | 'fecha_alta'
  | 'tipo_persona'
  | 'estructura'
  | 'rec'
  | 'sucursal'
  | 'desarrollo'
  | 'expediente'
  | 'operacion'
  | 'periodo'

/**
 * Quién ejecuta el paso en F1.
 *
 * No es decoración: un checklist que le pide al cliente algo que solo nosotros
 * podemos hacer lo deja atorado mirando una casilla que nunca va a marcar.
 */
export type Responsable = 'vizo' | 'obligado'

export interface PasoDeArranque {
  clave: ClaveDePaso
  hecho: boolean
  quien: Responsable
}

export interface Arranque {
  pasos: PasoDeArranque[]
  hechos: number
  completo: boolean
  /**
   * Si el semáforo de Inicio puede responder su pregunta.
   *
   * Sin actividad contratada no puede: no hay obligación que calcular, y todo
   * lo que pinte será silencio disfrazado de tranquilidad.
   */
  puedeEvaluar: boolean
}

interface Fila {
  actividad: boolean
  fecha_alta: boolean
  tipo_persona: boolean
  estructura: boolean
  rec: boolean
  sucursal: boolean
  desarrollo: boolean
  expediente: boolean
  operacion: boolean
  periodo: boolean
  fracciones: string[]
  /** null mientras no se sepa. Decide qué pasos siquiera aparecen. */
  tipo: 'fisica' | 'moral' | 'fideicomiso' | 'figura_juridica' | null
}

/** El orden es el del arranque real: configurar, luego operar. */
const RESPONSABLE: Record<ClaveDePaso, Responsable> = {
  actividad: 'vizo',
  fecha_alta: 'obligado',
  tipo_persona: 'obligado',
  estructura: 'obligado',
  rec: 'obligado',
  sucursal: 'vizo',
  desarrollo: 'vizo',
  expediente: 'obligado',
  operacion: 'obligado',
  periodo: 'obligado',
}

export async function arranqueDelObligado(
  db: EjecutorSql,
  p: { sesion: ContextoSesion },
): Promise<Arranque> {
  await exigirSesionActiva(db, p.sesion)

  // El filtro por tenant va explícito además de RLS. Las dos capas se
  // sostienen: la auditoría de F1 mostró que cuando solo hay una, quitarla
  // pasa desapercibido.
  const { rows } = await db.query(
    `select
       exists (select 1 from actividades_tenant where tenant_id = $1) as actividad,
       exists (select 1 from tenants
                where id = $1 and fecha_alta_autoridad is not null) as fecha_alta,
       exists (select 1 from tenants
                where id = $1 and tipo_persona is not null) as tipo_persona,
       -- Cap. II Ter (Art. 10 Sexies): el paso se cumple cuando la estructura
       -- existe, al menos un integrante fue ENVIADO al SAT y no queda ninguno
       -- capturado sin enviar. Una estructura a medias es un trámite a medias.
       exists (select 1 from estructura_del_obligado e
                where e.tenant_id = $1
                  and exists (select 1 from integrantes_estructura i
                               where i.estructura_id = e.id and i.estado = 'enviado')
                  and not exists (select 1 from integrantes_estructura i
                                   where i.estructura_id = e.id and i.estado = 'capturado')
              ) as estructura,
       -- Art. 20 LFPIORPI ¶2: una designación PENDIENTE no cuenta. Mientras no
       -- sea aceptada, las obligaciones siguen recayendo en el órgano de
       -- administración, así que este paso solo se marca con 'aceptada'.
       exists (select 1 from designaciones_rec
                where tenant_id = $1 and estado = 'aceptada') as rec,
       (select tipo_persona::text from tenants where id = $1) as tipo,
       exists (select 1 from sucursales where tenant_id = $1 and activa) as sucursal,
       exists (select 1 from desarrollos_inmobiliarios
                where tenant_id = $1 and activo) as desarrollo,
       exists (select 1 from expedientes
                where tenant_id = $1 and estatus = 'aprobado') as expediente,
       exists (select 1 from operaciones_vigentes where tenant_id = $1) as operacion,
       -- El arranque no termina cuando el sistema está configurado: termina
       -- cuando el obligado cerró UN ciclo completo y tiene el acuse de la
       -- autoridad. Antes de eso nadie sabe si el circuito funciona de punta a
       -- punta, y descubrirlo el día 17 es tarde.
       exists (select 1 from avisos
                where tenant_id = $1 and estatus = 'presentado') as periodo,
       coalesce(
         (select array_agg(av.fraccion::text)
            from actividades_tenant t
            join actividades_vulnerables av on av.id = t.actividad_id
           where t.tenant_id = $1),
         '{}'
       ) as fracciones`,
    [p.sesion.tenantId],
  )

  const f = rows[0] as Fila

  const aplica = (clave: ClaveDePaso): boolean => {
    if (clave === 'desarrollo') return f.fracciones.includes('V_BIS')
    // El REC lo designan las personas morales y las figuras jurídicas, no las
    // físicas (Art. 20 LFPIORPI ¶1). Mientras no se sepa qué clase de persona
    // es el obligado, el paso NO se muestra — y no porque no aplique, sino
    // porque el paso anterior es justo averiguarlo. Enseñarlo antes sería
    // reclamar una obligación que quizá no existe; darlo por cumplido sería
    // esconder una que quizá sí.
    if (clave === 'rec')
      return f.tipo === 'moral' || f.tipo === 'fideicomiso' || f.tipo === 'figura_juridica'
    // La estructura del Cap. II Ter es de quienes actúan por fideicomiso u
    // otra figura jurídica. Mismo criterio que el REC: mientras no se sepa la
    // clase de persona, el paso no se muestra.
    if (clave === 'estructura')
      return f.tipo === 'fideicomiso' || f.tipo === 'figura_juridica'
    return true
  }

  const pasos: PasoDeArranque[] = (
    [
      'actividad',
      'fecha_alta',
      'tipo_persona',
      'estructura',
      'rec',
      'sucursal',
      'desarrollo',
      'expediente',
      'operacion',
      'periodo',
    ] as const
  )
    .filter(aplica)
    .map((clave) => ({ clave, hecho: f[clave], quien: RESPONSABLE[clave] }))

  const hechos = pasos.filter((x) => x.hecho).length

  return {
    pasos,
    hechos,
    completo: hechos === pasos.length,
    puedeEvaluar: f.actividad,
  }
}
