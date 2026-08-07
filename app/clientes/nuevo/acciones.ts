'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { Client } from 'pg'
import { sesionRequerida } from '../../../src/supabase/sesion'
import { altaCliente, FaltaBeneficiario } from '../../../src/persistencia/clientes'
import { DatosDeClienteInvalidos, type TipoPersona } from '../../../src/dominio/clientes'

export interface EstadoFormulario {
  problemas: string[]
  /**
   * Lo que el usuario ya había capturado.
   *
   * React 19 resetea el formulario después de cada acción, así que sin esto un
   * error de validación borra todo lo tecleado. En un alta con quince campos
   * eso no es una molestia: es la fricción que empuja a la gente de vuelta al
   * Excel, que es justo lo que este producto viene a sustituir.
   */
  valores: Record<string, string>
}

/**
 * Alta de cliente desde el formulario.
 *
 * La validación NO vive aquí: vive en `prepararAltaCliente`, con sus 21 tests.
 * Esta función traduce el FormData al tipo del dominio y traduce los errores
 * del dominio a algo que se pueda pintar. Duplicar reglas de validación en la
 * UI es como se desincronizan.
 */
export async function crearCliente(
  _previo: EstadoFormulario,
  form: FormData,
): Promise<EstadoFormulario> {
  const sesion = await sesionRequerida()

  // Se conserva todo lo capturado para devolverlo si algo falla.
  const valores: Record<string, string> = {}
  for (const [clave, valor] of form.entries()) {
    if (typeof valor === 'string') valores[clave] = valor
  }

  const texto = (campo: string): string | undefined => {
    const v = form.get(campo)
    if (typeof v !== 'string') return undefined
    const limpio = v.trim()
    return limpio === '' ? undefined : limpio
  }

  const tipoPersona = (texto('tipoPersona') ?? 'fisica') as TipoPersona
  const paisAlterno = texto('identidadPais')
  const identidadAlterna =
    texto('identidadNumero') !== undefined && paisAlterno !== undefined
      ? {
          tipo_doc: texto('identidadTipoDoc') ?? 'pasaporte',
          numero: texto('identidadNumero') ?? '',
          pais: paisAlterno,
        }
      : undefined

  // Un solo beneficiario por ahora: es lo que el ciclo mínimo necesita. La
  // tabla admite varios y la UI de la semana 6 los agregará.
  const declara = form.get('sinBeneficiario') === 'on'
  const nombreBeneficiario = texto('beneficiarioNombre')
  const pctTexto = texto('beneficiarioPct')

  const beneficiarios =
    tipoPersona === 'fisica'
      ? []
      : [
          {
            nombre: nombreBeneficiario ?? '',
            rfc: texto('beneficiarioRfc'),
            controlPor: (texto('beneficiarioControlPor') ?? 'participacion') as
              | 'participacion'
              | 'control_efectivo',
            participacionPct: pctTexto === undefined ? undefined : Number(pctTexto),
            esDeclaracion: declara,
          },
        ]

  const db = new Client({ connectionString: cadenaDeConexion() })
  await db.connect()
  try {
    await altaCliente(db, {
      tenantId: sesion.tenantId,
      actorId: sesion.usuarioId,
      datos: {
        tipoPersona,
        nombreORazonSocial: texto('nombreORazonSocial') ?? '',
        nombrePila: texto('nombrePila'),
        apellidoPaterno: texto('apellidoPaterno'),
        apellidoMaterno: texto('apellidoMaterno'),
        rfc: texto('rfc'),
        curp: texto('curp'),
        fechaNacimientoOConstitucion: texto('fecha'),
        nacionalidad: texto('nacionalidad'),
        identidadAlterna,
      },
      beneficiarios,
    })
  } catch (e) {
    if (e instanceof DatosDeClienteInvalidos) return { problemas: [...e.problemas], valores }
    if (e instanceof FaltaBeneficiario) return { problemas: [e.message], valores }
    return {
      problemas: [e instanceof Error ? e.message : 'Error inesperado al guardar.'],
      valores,
    }
  } finally {
    await db.end()
  }

  revalidatePath('/clientes')
  redirect('/clientes')
}

/**
 * Regla dura 6: si falta la cadena de conexión, fallar aquí con un mensaje
 * claro, no más adelante con un "connection refused" que no dice qué hacer.
 */
function cadenaDeConexion(): string {
  const url = process.env['VIZO_DB_URL']
  if (url === undefined || url === '') {
    throw new Error('Falta VIZO_DB_URL. Cópiala de .env.example a .env.local.')
  }
  return url
}
