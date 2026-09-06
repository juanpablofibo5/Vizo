-- ---------------------------------------------------------------------------
-- Fase 3 · El tipo de alerta del cambio estructural
-- ---------------------------------------------------------------------------
-- Solo el `alter type`, en archivo aparte: Postgres no deja USAR un valor de
-- enum en la misma transacción que lo agrega («unsafe use of new value», la
-- lección de las alertas del Art. 41). Las tablas y aserciones van en la
-- migración siguiente, que sí inserta alertas de este tipo.
alter type tipo_alerta add value if not exists 'cambio_estructural';
