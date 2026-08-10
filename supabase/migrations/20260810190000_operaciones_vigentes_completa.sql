-- ---------------------------------------------------------------------------
-- operaciones_vigentes deja de perder columnas en silencio
-- ---------------------------------------------------------------------------
-- La vista enumeraba dieciocho columnas y es anterior a las que el AVISO
-- necesita: desarrollo_id, modalidad, forma, instrumento_monetario,
-- moneda_codigo, aportacion_fideicomiso, nombre_institucion y las demás. Se
-- añadieron a `operaciones` y la vista siguió sin ellas.
--
-- El generador del aviso las pidió y murió con "column o.desarrollo_id does not
-- exist". Fue ruidoso por suerte, no por diseño: si en vez de faltar hubieran
-- quedado con otro nombre parecido —hay `moneda` y `moneda_codigo`, que son
-- catálogos DISTINTOS— el aviso habría salido con la divisa equivocada sin que
-- nada reventara.
--
-- `create view ... as select *` NO resuelve esto: Postgres expande el asterisco
-- al crear la vista y congela la lista igual. Por eso, además de recrearla, se
-- añade una aserción que compara las dos listas — la única forma de que esto no
-- vuelva a pasar cuando alguien agregue la columna decimonovena.

create or replace view operaciones_vigentes as
select o.id, o.tenant_id, o.sucursal_id, o.cliente_id, o.actividad_id,
       o.fecha_operacion,
       o.monto_base, o.iva, o.isai, o.otros_accesorios, o.monto_total,
       o.forma_pago, o.moneda, o.cfdi_uuid, o.descripcion_bien,
       o.corrige_a, o.registrado_por, o.registrado_en,
       -- Las que el aviso necesita.
       o.desarrollo_id, o.modalidad, o.forma, o.tipo_tercero,
       o.instrumento_monetario, o.moneda_codigo,
       o.valor_inmueble_preventa, o.monto_estimado_especie,
       o.aportacion_fideicomiso, o.nombre_institucion
  from operaciones o
 where not exists (
   select 1 from operaciones c where c.corrige_a = o.id
 );

comment on view operaciones_vigentes is
  'Operaciones no corregidas. Expone TODAS las columnas de operaciones: app.verificar_vista_operaciones_vigentes() lo comprueba en cada migración.';

-- ---------------------------------------------------------------------------
-- La aserción que lo vuelve imposible de repetir
-- ---------------------------------------------------------------------------
create or replace function app.verificar_vista_operaciones_vigentes()
returns void
language plpgsql
as $$
declare
  v_faltantes text;
begin
  select string_agg(c.column_name, ', ' order by c.ordinal_position)
    into v_faltantes
    from information_schema.columns c
   where c.table_schema = 'public' and c.table_name = 'operaciones'
     and not exists (
       select 1 from information_schema.columns v
        where v.table_schema = 'public'
          and v.table_name = 'operaciones_vigentes'
          and v.column_name = c.column_name
     );

  if v_faltantes is not null then
    raise exception
      'operaciones_vigentes no expone estas columnas de operaciones: %. Una vista que enumera columnas se queda atrás sin avisar, y quien la consulte creerá que el dato no existe — o peor, tomará uno parecido. Recréala incluyéndolas.',
      v_faltantes;
  end if;
end $$;

do $$
begin
  perform app.verificar_vista_operaciones_vigentes();
  raise notice '✓ operaciones_vigentes expone todas las columnas de operaciones';
end $$;
