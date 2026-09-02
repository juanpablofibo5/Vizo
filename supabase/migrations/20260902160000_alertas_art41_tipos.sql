-- ---------------------------------------------------------------------------
-- Art. 41 fr. V · Los dos tipos de alerta que faltaban
-- ---------------------------------------------------------------------------
-- Va SOLO el `alter type`, y en un archivo aparte, por una restricción de
-- Postgres y no por gusto: un valor nuevo de enum no se puede USAR en la misma
-- transacción que lo agrega («unsafe use of new value», comprobado en la base
-- local). Las columnas, los CHECK y las aserciones —que sí insertan alertas de
-- estos tipos— van en la migración siguiente.
--
-- El Art. 41 fr. V pide alertar sobre «aquellos actos u operaciones que se
-- pretendan llevar a cabo con Clientes o Usuarias de Grado de Riesgo alto,
-- Personas Políticamente Expuestas o que se encuentren incluidas en el
-- listado a que hace referencia el primer párrafo del artículo 38». El tercer
-- supuesto ya existe (`screening`, ADR-30); estos son los otros dos.

alter type tipo_alerta add value if not exists 'cliente_riesgo_alto';
alter type tipo_alerta add value if not exists 'cliente_pep';
