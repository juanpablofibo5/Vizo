-- ---------------------------------------------------------------------------
-- Desde cuándo el obligado tiene que informar
-- ---------------------------------------------------------------------------
-- Issue #16, hallazgo de la auditoría de la semana 10.
--
-- `periodosPendientes` sabía responder "hubo actividad y no se ha presentado",
-- y NO sabía responder "me di de alta en marzo, no operé, y debía informar en
-- cero desde entonces". El segundo caso también es incumplimiento, y es el más
-- fácil de pasar por alto: no hay operaciones que recuerden la obligación.
--
-- La obligación arranca con el ALTA Y REGISTRO ante la autoridad, que es un
-- acto ante el SAT y no tiene nada que ver con cuándo se creó la fila en VIZO.
-- `created_at` respondía otra pregunta y usarlo habría producido una lista de
-- pendientes plausible y equivocada en las dos direcciones.

alter table tenants
  add column fecha_alta_autoridad date;

comment on column tenants.fecha_alta_autoridad is
  'Fecha del alta y registro del sujeto obligado ante el SAT. Desde aquí corre la obligación de informar, incluidos los informes en cero. NULL significa "no lo sabemos", nunca "no aplica": la serie de periodos arranca entonces en la primera operación, que cubre menos.';

-- Una fecha de alta en el futuro no existe, y una anterior a la Ley tampoco.
-- La LFPIORPI entró en vigor el 17 de julio de 2013.
alter table tenants
  add constraint fecha_alta_autoridad_plausible
  check (
    fecha_alta_autoridad is null
    or (fecha_alta_autoridad >= date '2013-07-17' and fecha_alta_autoridad <= current_date)
  );

-- ---------------------------------------------------------------------------
-- Aserción: que el CHECK de verdad rechace
-- ---------------------------------------------------------------------------
-- La fecha del obligado demo va en `seed.sql`, no aquí: las migraciones corren
-- ANTES del seed y el obligado todavía no existe. Lo que sí se comprueba aquí
-- es que la restricción muerda — declararla no basta.
do $$
declare v_rechazo boolean := false;
begin
  begin
    insert into tenants (rfc, razon_social, domicilio, fecha_alta_autoridad)
    values ('FAA010101AAA', 'Aserción fecha alta', '{}'::jsonb, current_date + 1);
  exception
    when check_violation then v_rechazo := true;
  end;

  if not v_rechazo then
    raise exception 'El CHECK aceptó una fecha de alta en el futuro. Una obligación no puede empezar mañana.';
  end if;

  if exists (select 1 from tenants where rfc = 'FAA010101AAA') then
    raise exception 'La aserción dejó datos en la base.';
  end if;

  raise notice '✓ tenants.fecha_alta_autoridad — la obligación arranca en el alta, no en la primera operación';
end $$;
