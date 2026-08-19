-- ================================================================
-- 014_mediciones_reales.sql — Medidas REALES por medición certificada
-- Ejecutar a mano en el SQL Editor de Supabase, DESPUÉS de 010, 011 y 012.
-- El bloque entero es re-corrible: se puede pegar de nuevo sin que aborte.
--
-- Al certificar, el encargado marca qué mediciones se ejecutaron
-- (certificacion_mediciones, 012). Esta tabla agrega el paso siguiente: con qué
-- medidas salieron DE VERDAD. La pared se planificó de 4.20 m y salió de 3.85,
-- o apareció una puerta no prevista. Es el control de DESVÍO DE CÓMPUTO,
-- hermano del desvío de cantidad de material y del desvío de precio (013).
--
-- Tres decisiones de diseño que hay que tener presentes al leer estas filas:
--
--   1. NO se toca `mediciones`. El cómputo original y el presupuesto quedan
--      intactos: esto es una capa aparte de "lo que realmente pasó", que solo
--      sirve para comparar. Un cambio acá nunca mueve el presupuesto.
--   2. La medida real es OPCIONAL por medición. Si el encargado no corrige una
--      pared, no hay fila acá para ella y se asume que salió como se planificó.
--      Ausencia de fila = sin desvío, no desvío cero cargado a mano.
--   3. El desvío NO se guarda: se calcula al leer, comparando
--      mediciones.cantidad_calculada (planificado) contra
--      mediciones_reales.cantidad_calculada (real). Mismo criterio que el resto
--      del sistema: lo derivado se calcula, no se persiste.
--
-- RLS: activo por usuario, encadenando certificaciones → obras, con el mismo
-- patrón que certificacion_items / certificacion_mediciones.
-- ================================================================

-- ── 1. Tabla mediciones_reales ──────────────────────────────────
-- Los tipos numéricos son los mismos que en `mediciones` (002_rubros_items.sql)
-- para que planificado y real se comparen sin diferencias de redondeo.
--
-- OJO con `n`: acá es nullable (en `mediciones` es NOT NULL DEFAULT 1) y la
-- fórmula es la misma que allá, así que una fila con n NULL da
-- cantidad_calculada NULL. El backend siempre tiene que mandar n — al cargar
-- una medida real, se prellena con el n de la medición original.
CREATE TABLE IF NOT EXISTS mediciones_reales (
  id                 uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  certificacion_id   uuid          NOT NULL REFERENCES certificaciones(id) ON DELETE CASCADE,
  -- A qué medición planificada corresponde esta medida real.
  medicion_id        uuid          NOT NULL REFERENCES mediciones(id)      ON DELETE CASCADE,
  n                  numeric(14,4),
  largo              numeric(14,4),
  ancho              numeric(14,4),
  alto               numeric(14,4),
  -- Misma fórmula que mediciones.cantidad_calculada. GENERATED ALWAYS: nunca se
  -- manda desde el backend, la calcula la base.
  cantidad_calculada numeric(18,4) GENERATED ALWAYS AS (
    n * COALESCE(largo, 1) * COALESCE(ancho, 1) * COALESCE(alto, 1)
  ) STORED,
  created_at         timestamptz   NOT NULL DEFAULT now(),
  updated_at         timestamptz   NOT NULL DEFAULT now(),
  -- Una medición no puede tener dos medidas reales en la misma certificación.
  UNIQUE (certificacion_id, medicion_id)
);


-- ── 2. Índices ──────────────────────────────────────────────────
-- El de certificacion_id sirve al listado de una certificación; el de
-- medicion_id, al cruce planificado vs real por medición.
CREATE INDEX IF NOT EXISTS idx_mediciones_reales_certificacion_id
  ON mediciones_reales(certificacion_id);
CREATE INDEX IF NOT EXISTS idx_mediciones_reales_medicion_id
  ON mediciones_reales(medicion_id);


-- ── 3. Activar RLS ──────────────────────────────────────────────
ALTER TABLE mediciones_reales ENABLE ROW LEVEL SECURITY;


-- ── 4. Permisos de rol ──────────────────────────────────────────
-- Supabase ya concede estos privilegios por default privileges en el schema
-- public, así que normalmente esto es un no-op. Va explícito porque un 42501
-- por GRANT faltante es indistinguible de un 42501 por RLS.
GRANT SELECT, INSERT, UPDATE, DELETE ON mediciones_reales TO authenticated;


-- ── 5. Políticas (vía certificaciones → obras) ──────────────────
-- Mismo encadenamiento que certificacion_mediciones: la tabla no tiene obra_id,
-- así que la pertenencia se resuelve subiendo hasta obras.user_id.
-- Los DROP ... IF EXISTS hacen el bloque re-corrible sin error.
DROP POLICY IF EXISTS "mediciones_reales_select" ON mediciones_reales;
CREATE POLICY "mediciones_reales_select" ON mediciones_reales FOR SELECT USING (
  EXISTS (SELECT 1 FROM certificaciones JOIN obras ON obras.id = certificaciones.obra_id WHERE certificaciones.id = mediciones_reales.certificacion_id AND obras.user_id = auth.uid())
);

DROP POLICY IF EXISTS "mediciones_reales_insert" ON mediciones_reales;
CREATE POLICY "mediciones_reales_insert" ON mediciones_reales FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM certificaciones JOIN obras ON obras.id = certificaciones.obra_id WHERE certificaciones.id = mediciones_reales.certificacion_id AND obras.user_id = auth.uid())
);

-- Sin WITH CHECK explícito: Postgres aplica el USING también a la fila nueva.
DROP POLICY IF EXISTS "mediciones_reales_update" ON mediciones_reales;
CREATE POLICY "mediciones_reales_update" ON mediciones_reales FOR UPDATE USING (
  EXISTS (SELECT 1 FROM certificaciones JOIN obras ON obras.id = certificaciones.obra_id WHERE certificaciones.id = mediciones_reales.certificacion_id AND obras.user_id = auth.uid())
);

DROP POLICY IF EXISTS "mediciones_reales_delete" ON mediciones_reales;
CREATE POLICY "mediciones_reales_delete" ON mediciones_reales FOR DELETE USING (
  EXISTS (SELECT 1 FROM certificaciones JOIN obras ON obras.id = certificaciones.obra_id WHERE certificaciones.id = mediciones_reales.certificacion_id AND obras.user_id = auth.uid())
);


-- ── 6. Trigger updated_at ───────────────────────────────────────
-- set_updated_at() ya fue definida en 001_initial_schema.sql
DROP TRIGGER IF EXISTS set_mediciones_reales_updated_at ON mediciones_reales;
CREATE TRIGGER set_mediciones_reales_updated_at
BEFORE UPDATE ON mediciones_reales
FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- ── 7. Verificación ─────────────────────────────────────────────
-- Después de correr esto, las 4 políticas tienen que aparecer acá.
-- Si devuelve 0 filas, el bloque no se aplicó entero.
--
--   select tablename, cmd, policyname from pg_policies
--   where tablename = 'mediciones_reales' order by cmd;
--
-- Y la columna generada tiene que figurar como ALWAYS:
--
--   select column_name, is_generated, generation_expression
--   from information_schema.columns
--   where table_name = 'mediciones_reales' and column_name = 'cantidad_calculada';
