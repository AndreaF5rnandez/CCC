-- ================================================================
-- 012_certificacion_mediciones.sql
-- Ejecutar a mano en el SQL Editor de Supabase, DESPUÉS de 010 y 011.
-- El bloque entero es re-corrible: se puede pegar de nuevo sin que aborte.
--
-- Hasta acá una certificación guardaba QUÉ ítems se ejecutaron y CUÁNTO
-- (certificacion_items.cantidad_ejecutada), pero no CUÁLES mediciones. Con eso
-- alcanzaba para calcular el desvío, pero no para saber que la Pared 5 ya se
-- certificó y no debería volver a ofrecerse.
--
-- Esta tabla guarda ese detalle. Las certificaciones viejas no tienen filas
-- acá: simplemente no marcan ninguna medición, que es el comportamiento previo.
-- ================================================================

-- ── 1. Tabla ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS certificacion_mediciones (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  certificacion_id uuid        NOT NULL REFERENCES certificaciones(id) ON DELETE CASCADE,
  medicion_id      uuid        NOT NULL REFERENCES mediciones(id)      ON DELETE CASCADE,
  created_at       timestamptz NOT NULL DEFAULT now(),
  -- Una medición no se repite dentro de la misma certificación.
  UNIQUE (certificacion_id, medicion_id)
);


-- ── 2. Índices ──────────────────────────────────────────────────
-- El de medicion_id es el que usa la consulta de "qué ya se certificó".
CREATE INDEX IF NOT EXISTS idx_certificacion_mediciones_cert_id
  ON certificacion_mediciones(certificacion_id);
CREATE INDEX IF NOT EXISTS idx_certificacion_mediciones_medicion_id
  ON certificacion_mediciones(medicion_id);


-- ── 3. RLS ──────────────────────────────────────────────────────
ALTER TABLE certificacion_mediciones ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON certificacion_mediciones TO authenticated;


-- ── 4. Políticas (vía certificaciones → obras) ──────────────────
-- Mismo encadenamiento que certificacion_items: la tabla no tiene obra_id, así
-- que la pertenencia se resuelve subiendo hasta obras.user_id.
DROP POLICY IF EXISTS "certificacion_mediciones_select" ON certificacion_mediciones;
CREATE POLICY "certificacion_mediciones_select" ON certificacion_mediciones FOR SELECT USING (
  EXISTS (SELECT 1 FROM certificaciones JOIN obras ON obras.id = certificaciones.obra_id WHERE certificaciones.id = certificacion_mediciones.certificacion_id AND obras.user_id = auth.uid())
);

DROP POLICY IF EXISTS "certificacion_mediciones_insert" ON certificacion_mediciones;
CREATE POLICY "certificacion_mediciones_insert" ON certificacion_mediciones FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM certificaciones JOIN obras ON obras.id = certificaciones.obra_id WHERE certificaciones.id = certificacion_mediciones.certificacion_id AND obras.user_id = auth.uid())
);

-- Sin WITH CHECK explícito: Postgres aplica el USING también a la fila nueva.
DROP POLICY IF EXISTS "certificacion_mediciones_update" ON certificacion_mediciones;
CREATE POLICY "certificacion_mediciones_update" ON certificacion_mediciones FOR UPDATE USING (
  EXISTS (SELECT 1 FROM certificaciones JOIN obras ON obras.id = certificaciones.obra_id WHERE certificaciones.id = certificacion_mediciones.certificacion_id AND obras.user_id = auth.uid())
);

DROP POLICY IF EXISTS "certificacion_mediciones_delete" ON certificacion_mediciones;
CREATE POLICY "certificacion_mediciones_delete" ON certificacion_mediciones FOR DELETE USING (
  EXISTS (SELECT 1 FROM certificaciones JOIN obras ON obras.id = certificaciones.obra_id WHERE certificaciones.id = certificacion_mediciones.certificacion_id AND obras.user_id = auth.uid())
);


-- ── 5. Verificación ─────────────────────────────────────────────
-- Después de correr esto, las 4 políticas tienen que aparecer acá.
-- Si devuelve 0 filas, el bloque no se aplicó entero.
--
--   select tablename, cmd, policyname from pg_policies
--   where tablename = 'certificacion_mediciones' order by cmd;
