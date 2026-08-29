import { Marca } from '../componentes/marca'

export const metadata = {
  title: 'Aviso de privacidad — VIZO',
  description: 'Aviso de privacidad integral de la plataforma VIZO.',
}

/**
 * El aviso de privacidad, público (Capa A · issue #33 · D4 del benchmark).
 *
 * ────────────────────────────────────────────────────────────────────────────
 * POR QUÉ ESTA PÁGINA ES PARTE DEL PRODUCTO Y NO UN TRÁMITE
 * ────────────────────────────────────────────────────────────────────────────
 * Un competidor de la capa de captura opera hoy con sus enlaces de Privacidad
 * apuntando a `#` (verificado el 28-ago-2026, captura fechada en el repo).
 * Para una plataforma que custodia identificaciones y expedientes, tener este
 * documento publicado, fechado y versionado es un diferenciador verificable en
 * demo — no solo una obligación propia.
 *
 * LA DISTINCIÓN QUE ESTE AVISO EXISTE PARA DEJAR CLARA: VIZO es RESPONSABLE de
 * los datos de quienes usan el portal, y ENCARGADO de los datos que cada
 * sujeto obligado trata dentro de él. Los titulares de esos segundos datos
 * (los clientes del obligado) tienen como responsable a SU obligado — y el
 * aviso que les aplica es el de él. Confundir los dos papeles haría a VIZO
 * prometer sobre datos que no decide.
 *
 * Toda afirmación de esta página tiene respaldo en el texto contrastado de la
 * LFPDPPP (docs/LFPDPPP.md) o en el diseño real del sistema. Las preguntas
 * abiertas con el abogado (§3 de ese documento) NO se afirman aquí.
 */
export default function AvisoDePrivacidad() {
  return (
    <main className="legal">
      <div className="legal-caja">
        <span className="legal-marca">
          <Marca tamano={22} titulo="VIZO" />
          VIZO
        </span>

        <h1>Aviso de privacidad integral</h1>
        <p className="legal-meta">
          Versión 1 · 29 de agosto de 2026 · Este aviso se actualiza en esta misma página; la
          versión y la fecha cambian con él.
        </p>

        <h2>1 · Quién es el responsable</h2>
        <p>
          <strong>ORVEX / VIZO</strong>, con domicilio en Mérida, Yucatán, México, es responsable
          del tratamiento de los datos personales que se describen en este aviso. Contacto para
          todo lo relativo a datos personales:{' '}
          <a href="mailto:privacidad@vizo.mx">privacidad@vizo.mx</a>.
        </p>

        <h2>2 · Los dos papeles de VIZO — y cuál aplica a tus datos</h2>
        <div className="legal-destacado">
          <p>
            <strong>Si usas el portal</strong> (administrador o capturista de un sujeto obligado):
            VIZO es <strong>responsable</strong> de tus datos de cuenta, y este aviso te aplica
            directamente.
          </p>
          <p>
            <strong>Si eres cliente de una empresa que usa VIZO</strong>: el responsable de tus
            datos es <strong>esa empresa</strong> (el sujeto obligado que te identificó para
            cumplir la LFPIORPI). VIZO los trata por cuenta y orden de ella, como{' '}
            <strong>encargado</strong>, únicamente conforme a sus instrucciones y a la ley. El
            aviso de privacidad que te aplica es el de esa empresa; los derechos ARCO sobre esos
            datos se ejercen ante ella, y VIZO la asiste para responderte.
          </p>
        </div>

        <h2>3 · Qué datos se tratan, y para qué</h2>
        <p>
          <strong>De quienes usan el portal</strong> (VIZO como responsable): nombre, correo
          electrónico, rol y registro de sus acciones en el sistema. Finalidades primarias: crear
          y operar la cuenta, aplicar los permisos que correspondan al rol, y conservar la
          evidencia de quién hizo qué — que es parte del servicio de cumplimiento mismo.
        </p>
        <p>
          <strong>De los clientes de cada sujeto obligado</strong> (VIZO como encargado): los
          datos y documentos de identificación que la LFPIORPI y sus Reglas exigen al obligado
          recabar — identificación oficial, RFC y CURP, domicilio, actividad, beneficiario
          controlador, operaciones. Finalidad única: que el obligado cumpla sus obligaciones
          legales de identificación, expediente, evaluación de riesgo y avisos.
        </p>
        <p>
          VIZO <strong>no</strong> usa los datos para publicidad, <strong>no</strong> los vende ni
          los comparte para fines de terceros, y <strong>no</strong> trata datos para finalidades
          secundarias.
        </p>

        <h2>4 · Encargados de infraestructura</h2>
        <p>
          Para operar la plataforma, VIZO utiliza proveedores de infraestructura que alojan y
          procesan datos por su cuenta: <strong>Supabase</strong> (base de datos y archivos,
          alojados en AWS, región us-east-1) y <strong>Vercel</strong> (aplicación web). Actúan
          bajo contrato y obligación de confidencialidad. Fuera de eso, VIZO no transfiere datos
          personales a terceros, salvo requerimiento de autoridad competente debidamente fundado.
        </p>

        <h2>5 · Cuánto tiempo se conservan</h2>
        <p>
          Los datos que ya no son necesarios se <strong>bloquean</strong> y después se{' '}
          <strong>suprimen</strong>, como ordena la ley (Arts. 24 y 25 de la LFPDPPP). Hay una
          excepción que importa en esta plataforma: los expedientes y registros que la LFPIORPI
          obliga a conservar <strong>no pueden cancelarse mientras esa obligación viva</strong>{' '}
          (Art. 25, fr. II de la LFPDPPP) — la propia LFPIORPI exige conservarlos por al menos
          diez años (Art. 18, fr. IV). En ese caso, la respuesta a una solicitud de cancelación es
          el bloqueo con su fundamento, no la supresión.
        </p>

        <h2>6 · Tus derechos ARCO</h2>
        <p>
          Puedes solicitar el <strong>A</strong>cceso, la <strong>R</strong>ectificación, la{' '}
          <strong>C</strong>ancelación o la <strong>O</strong>posición sobre tus datos, así como
          revocar tu consentimiento o pedir la limitación de uso, escribiendo a{' '}
          <a href="mailto:privacidad@vizo.mx">privacidad@vizo.mx</a> con: tu nombre, un medio para
          responderte, la descripción clara de lo que solicitas y algo que acredite tu identidad.
        </p>
        <p>
          Recibirás la determinación en un máximo de <strong>20 días</strong> desde la recepción,
          y si procede se hará efectiva dentro de los <strong>15 días siguientes</strong> (Art. 31
          de la LFPDPPP; ambos plazos pueden ampliarse una sola vez por un periodo igual, cuando
          las circunstancias lo justifiquen). Si tus datos los trata VIZO como encargado, te
          orientaremos para dirigir la solicitud al responsable — tu empresa obligada — y la
          asistiremos para responderte.
        </p>

        <h2>7 · Cómo se protegen</h2>
        <p>
          Medidas administrativas, técnicas y físicas conforme al Art. 18 de la LFPDPPP, y que
          esta plataforma puede demostrar: cifrado en tránsito y en reposo, aislamiento por
          empresa aplicado en la propia base de datos, bitácora inmutable de accesos y cambios, y
          la regla de que ningún dato personal viaja en registros técnicos ni telemetría. Si
          ocurriera una vulneración que afecte de forma significativa tus derechos, se te
          informará de forma inmediata (Art. 19).
        </p>

        <h2>8 · Cambios a este aviso</h2>
        <p>
          Cualquier cambio se publica en esta página, con nueva versión y fecha. Los cambios de
          fondo se comunican además por el propio portal.
        </p>

        <p className="legal-pie">
          Fundamento: Ley Federal de Protección de Datos Personales en Posesión de los
          Particulares, publicada en el DOF el 20 de marzo de 2025 (última reforma: 14 de
          noviembre de 2025), y Ley Federal para la Prevención e Identificación de Operaciones con
          Recursos de Procedencia Ilícita, en lo que ordena conservar. ·{' '}
          <a href="/login">Volver al acceso</a>
        </p>
      </div>
    </main>
  )
}
