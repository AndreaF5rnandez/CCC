-- ================================================================
-- 010_certificacion.sql — Esquema del módulo de Certificación
-- Ejecutar a mano en el SQL Editor de Supabase (bloque único).
--
-- Una "certificación" es un registro de ejecución real de obra con fecha
-- libre (la elige el encargado, sin período fijo). Agrupa uno o varios
-- ítems ejecutados juntos y guarda el material realmente consumido por
-- ese grupo, no por ítem: en obra se hace un pastón de mezcla y se
-- reparte entre varias paredes, así que el consumo real no se separa.
--
-- El previsto sale de la explosión de insumos; el desvío se calcula
-- después comparando ambos. Acá solo se prepara el esquema.
--
-- RLS: activo por usuario en las tres tablas, resuelto vía obras.user_id,
-- siguiendo el mismo patrón que rubros/items/mediciones en 003_rls.sql.
-- ================================================================

-- ── 1. Tabla certificaciones ────────────────────────────────────
CREATE TABLE certificaciones (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  obra_id     uuid        NOT NULL REFERENCES obras(id) ON DELETE CASCADE,
  fecha       date        NOT NULL,
  descripcion text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);


-- ── 2. Tabla certificacion_items ────────────────────────────────
-- Qué ítems del cómputo se ejecutaron en esa certificación.
CREATE TABLE certificacion_items (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  certificacion_id uuid        NOT NULL REFERENCES certificaciones(id) ON DELETE CASCADE,
  item_id          uuid        NOT NULL REFERENCES items(id)           ON DELETE CASCADE,
  created_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (certificacion_id, item_id)
);


-- ── 3. Tabla certificacion_insumos ──────────────────────────────
-- Material real consumido por el grupo de ítems de esa certificación.
CREATE TABLE certificacion_insumos (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  certificacion_id uuid        NOT NULL REFERENCES certificaciones(id) ON DELETE CASCADE,
  insumo_id        uuid        NOT NULL REFERENCES insumos(id)         ON DELETE CASCADE,
  cantidad_real    numeric     NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (certificacion_id, insumo_id)
);


-- ── 4. Índices ──────────────────────────────────────────────────
CREATE INDEX idx_certificaciones_obra_id           ON certificaciones(obra_id);
CREATE INDEX idx_certificacion_items_cert_id       ON certificacion_items(certificacion_id);
CREATE INDEX idx_certificacion_items_item_id       ON certificacion_items(item_id);
CREATE INDEX idx_certificacion_insumos_cert_id     ON certificacion_insumos(certificacion_id);
CREATE INDEX idx_certificacion_insumos_insumo_id   ON certificacion_insumos(insumo_id);


-- ── 5. Activar RLS ──────────────────────────────────────────────
ALTER TABLE certificaciones        ENABLE ROW LEVEL SECURITY;
ALTER TABLE certificacion_items    ENABLE ROW LEVEL SECURITY;
ALTER TABLE certificacion_insumos  ENABLE ROW LEVEL SECURITY;


-- ── 6. Permisos de rol ──────────────────────────────────────────
-- Supabase ya concede estos privilegios por default privileges en el schema
-- public, así que normalmente esto es un no-op. Va explícito porque un 42501
-- por GRANT faltante es indistinguible de un 42501 por RLS, y descartarlo de
-- entrada ahorra el rato de diagnóstico que ya perdimos una vez.
GRANT SELECT, INSERT, UPDATE, DELETE ON certificaciones       TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON certificacion_items   TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON certificacion_insumos TO authenticated;


-- ── 7. Políticas de certificaciones (vía obras) ─────────────────
-- Los DROP ... IF EXISTS hacen el bloque re-corrible sin error, igual que 009.
DROP POLICY IF EXISTS "certificaciones_select" ON certificaciones;
CREATE POLICY "certificaciones_select" ON certificaciones FOR SELECT USING (
  EXISTS (SELECT 1 FROM obras WHERE obras.id = certificaciones.obra_id AND obras.user_id = auth.uid())
);

DROP POLICY IF EXISTS "certificaciones_insert" ON certificaciones;
CREATE POLICY "certificaciones_insert" ON certificaciones FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM obras WHERE obras.id = certificaciones.obra_id AND obras.user_id = auth.uid())
);

-- Sin WITH CHECK explícito: Postgres aplica el USING también a la fila nueva.
DROP POLICY IF EXISTS "certificaciones_update" ON certificaciones;
CREATE POLICY "certificaciones_update" ON certificaciones FOR UPDATE USING (
  EXISTS (SELECT 1 FROM obras WHERE obras.id = certificaciones.obra_id AND obras.user_id = auth.uid())
);

DROP POLICY IF EXISTS "certificaciones_delete" ON certificaciones;
CREATE POLICY "certificaciones_delete" ON certificaciones FOR DELETE USING (
  EXISTS (SELECT 1 FROM obras WHERE obras.id = certificaciones.obra_id AND obras.user_id = auth.uid())
);


-- ── 8. Políticas de certificacion_items (vía certificaciones → obras) ──
-- La tabla no tiene obra_id, así que la pertenencia se resuelve encadenando
-- hasta obras, igual que items lo hace vía rubros.
DROP POLICY IF EXISTS "certificacion_items_select" ON certificacion_items;
CREATE POLICY "certificacion_items_select" ON certificacion_items FOR SELECT USING (
  EXISTS (SELECT 1 FROM certificaciones JOIN obras ON obras.id = certificaciones.obra_id WHERE certificaciones.id = certificacion_items.certificacion_id AND obras.user_id = auth.uid())
);

DROP POLICY IF EXISTS "certificacion_items_insert" ON certificacion_items;
CREATE POLICY "certificacion_items_insert" ON certificacion_items FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM certificaciones JOIN obras ON obras.id = certificaciones.obra_id WHERE certificaciones.id = certificacion_items.certificacion_id AND obras.user_id = auth.uid())
);

DROP POLICY IF EXISTS "certificacion_items_update" ON certificacion_items;
CREATE POLICY "certificacion_items_update" ON certificacion_items FOR UPDATE USING (
  EXISTS (SELECT 1 FROM certificaciones JOIN obras ON obras.id = certificaciones.obra_id WHERE certificaciones.id = certificacion_items.certificacion_id AND obras.user_id = auth.uid())
);

DROP POLICY IF EXISTS "certificacion_items_delete" ON certificacion_items;
CREATE POLICY "certificacion_items_delete" ON certificacion_items FOR DELETE USING (
  EXISTS (SELECT 1 FROM certificaciones JOIN obras ON obras.id = certificaciones.obra_id WHERE certificaciones.id = certificacion_items.certificacion_id AND obras.user_id = auth.uid())
);


-- ── 9. Políticas de certificacion_insumos (vía certificaciones → obras) ──
DROP POLICY IF EXISTS "certificacion_insumos_select" ON certificacion_insumos;
CREATE POLICY "certificacion_insumos_select" ON certificacion_insumos FOR SELECT USING (
  EXISTS (SELECT 1 FROM certificaciones JOIN obras ON obras.id = certificaciones.obra_id WHERE certificaciones.id = certificacion_insumos.certificacion_id AND obras.user_id = auth.uid())
);

DROP POLICY IF EXISTS "certificacion_insumos_insert" ON certificacion_insumos;
CREATE POLICY "certificacion_insumos_insert" ON certificacion_insumos FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM certificaciones JOIN obras ON obras.id = certificaciones.obra_id WHERE certificaciones.id = certificacion_insumos.certificacion_id AND obras.user_id = auth.uid())
);

-- cantidad_real se corrige en la pantalla, así que el UPDATE se usa de verdad.
DROP POLICY IF EXISTS "certificacion_insumos_update" ON certificacion_insumos;
CREATE POLICY "certificacion_insumos_update" ON certificacion_insumos FOR UPDATE USING (
  EXISTS (SELECT 1 FROM certificaciones JOIN obras ON obras.id = certificaciones.obra_id WHERE certificaciones.id = certificacion_insumos.certificacion_id AND obras.user_id = auth.uid())
);

DROP POLICY IF EXISTS "certificacion_insumos_delete" ON certificacion_insumos;
CREATE POLICY "certificacion_insumos_delete" ON certificacion_insumos FOR DELETE USING (
  EXISTS (SELECT 1 FROM certificaciones JOIN obras ON obras.id = certificaciones.obra_id WHERE certificaciones.id = certificacion_insumos.certificacion_id AND obras.user_id = auth.uid())
);


-- ── 10. Trigger updated_at ──────────────────────────────────────
-- set_updated_at() ya fue definida en 001_initial_schema.sql
DROP TRIGGER IF EXISTS set_certificaciones_updated_at ON certificaciones;
CREATE TRIGGER set_certificaciones_updated_at
BEFORE UPDATE ON certificaciones
FOR EACH ROW EXECUTE FUNCTION set_updated_at();
