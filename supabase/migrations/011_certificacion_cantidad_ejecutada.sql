-- ================================================================
-- 011_certificacion_cantidad_ejecutada.sql
-- Ejecutar a mano en el SQL Editor de Supabase, DESPUÉS de 010.
--
-- La 010 dejó certificacion_items con solo (certificacion_id, item_id):
-- eso alcanza para "este ítem se ejecutó", pero no para "se ejecutaron 12
-- de los 30 m² del ítem". El previsto de la certificación se calcula sobre
-- la cantidad ejecutada, así que hace falta poder guardar la parcial.
--
-- NULL = se ejecutó el ítem completo (la cantidad sale de la suma de sus
-- mediciones, como hasta ahora). Un número = ejecución parcial.
-- Es aditivo: no cambia el significado de las filas ya cargadas.
-- ================================================================

ALTER TABLE certificacion_items
  ADD COLUMN IF NOT EXISTS cantidad_ejecutada numeric;

-- Negativo no tiene sentido físico; 0 sí (se registró el ítem sin avance).
ALTER TABLE certificacion_items
  DROP CONSTRAINT IF EXISTS certificacion_items_cantidad_ejecutada_check;
ALTER TABLE certificacion_items
  ADD CONSTRAINT certificacion_items_cantidad_ejecutada_check
  CHECK (cantidad_ejecutada IS NULL OR cantidad_ejecutada >= 0);

COMMENT ON COLUMN certificacion_items.cantidad_ejecutada IS
  'Cantidad ejecutada del ítem en esta certificación. NULL = ítem completo '
  '(se usa la suma de sus mediciones).';
