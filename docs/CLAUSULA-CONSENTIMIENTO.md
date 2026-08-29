# Cláusula de consentimiento del formulario remoto — borrador

**29-ago-2026 · Capa A (issue #33) · pareja de la acción 5 del Addendum A1** (el
mecanismo de Firma Electrónica del Art. 23 Ter 3 ¶3 y esta cláusula entran al mismo
sprint). **Borrador para revisión del abogado**: la pregunta de si la identificación
es dato sensible (`LFPDPPP.md` §3, pregunta 1) decide si el consentimiento simple
basta o si se requiere el expreso y por escrito del Art. 8 — esta redacción está
hecha para el caso conservador (expreso, por escrito, mediante firma), de modo que
sirva en ambos.

---

**El texto, para el formulario del magic-link (F2):**

> **Consentimiento para el tratamiento de datos personales**
>
> Declaro que **[razón social del sujeto obligado]**, como responsable, me informó
> que los datos y documentos que proporciono en este formulario —incluida mi
> identificación oficial— se recaban para cumplir sus obligaciones de
> identificación y conocimiento del cliente bajo la Ley Federal para la Prevención
> e Identificación de Operaciones con Recursos de Procedencia Ilícita, y que serán
> conservados por el plazo que esa ley ordena (al menos diez años).
>
> Sé que puedo consultar su aviso de privacidad integral en **[medio del
> obligado]**, que la plataforma VIZO trata estos datos por cuenta del responsable
> como encargado, y que puedo ejercer mis derechos de acceso, rectificación,
> cancelación y oposición ante el responsable, en los términos de la Ley Federal de
> Protección de Datos Personales en Posesión de los Particulares.
>
> **Otorgo mi consentimiento expreso**, y lo firmo electrónicamente. Los datos de
> esta firma quedan asociados a este formulario y a su fecha.

---

## Notas de implementación (para el sprint del D-04)

- La casilla **no viene marcada** y el formulario no se envía sin ella: el
  consentimiento expreso no se presume.
- El texto firmado se congela con el formulario y su huella SHA-256 — la misma
  doctrina del cuestionario de riesgo alto (ADR-25): VIZO registra la firma, no la
  valida.
- Los corchetes los llena la configuración del obligado (razón social, medio de su
  aviso). **VIZO no redacta el aviso del obligado** — frontera de ALCANCE §0.5;
  esta cláusula solo remite a él.
- Si el abogado resuelve que la identificación no es sensible, el texto no cambia:
  el consentimiento expreso cubre de más, nunca de menos.
