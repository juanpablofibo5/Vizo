import { describe, expect, it } from 'vitest'
import { fraccionLegible } from '../../app/componentes/fraccion'

/**
 * La clave del catálogo no es lo que se lee en pantalla.
 *
 * `V_BIS` es una clave: se compara, se indexa, se guarda. "V Bis" es como lo
 * escribe el Art. 17 y como lo reconoce quien tiene que operarlo.
 */
describe('Fracción legible', () => {
  it('separa la clave y respeta el número romano', () => {
    expect(fraccionLegible('V_BIS')).toBe('V Bis')
  })

  it('una fracción sin sufijo se queda como está', () => {
    expect(fraccionLegible('XV')).toBe('XV')
  })

  it('el sufijo es palabra, no número: va en minúsculas', () => {
    // Las fracciones con dos sufijos existen en el Art. 17 y llegarán al
    // catálogo el día que se contrate otra actividad.
    expect(fraccionLegible('XII_TER')).toBe('XII Ter')
  })

  it('no depende de cómo venga escrita la clave', () => {
    expect(fraccionLegible('v_bis')).toBe('V Bis')
  })

  it('una clave vacía no produce basura', () => {
    expect(fraccionLegible('')).toBe('')
    expect(fraccionLegible('_')).toBe('')
  })
})
