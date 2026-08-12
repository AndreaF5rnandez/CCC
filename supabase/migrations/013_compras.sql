-- ================================================================
-- 013_compras.sql — Registro de compras de materiales por obra
-- Ejecutar a mano en el SQL Editor de Supabase (bloque único).
-- El bloque entero es re-corrible: se puede pegar de nuevo sin que aborte.
--
-- El encargado carga cada compra que hace (fecha, insumo, cantidad, precio
-- pagado, proveedor). Después el sistema compara el precio pagado contra el
-- precio presupuestado: es el control de DESVÍO DE PRECIO, hermano del desvío
-- de cantidad que ya resuelve el módulo de Certificación.
--
-- Dos decisiones de diseño que hay que tener presentes al leer estas filas:
--
--   1. cantidad y precio_unitario_compra están en unidad de COMPRA (bolsas,
--      barras), no en unidad base. La conversión a unidad base para comparar
--      contra el presupuesto se hace en el cálculo, no acá. Es el mismo criterio
--      que usa la explosión de insumos con insumo_compra_obra (009).
--   2. NO hay UNIQUE sobre (obra_id, insumo_id): un mismo insumo se compra
--      varias veces en la misma obra, a distintas fechas, precios y proveedores.
--      Cada compra es una fila.
--
-- RLS: activo por usuario, resuelto vía obras.user_id, con el mismo patrón que
-- certificaciones en 010_certificacion.sql.
-- ================================================================

-- ── 1. Tabla compras ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS compras (
  id                     uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  obra_id                uuid        NOT NULL REFERENCES obras(id)   ON DELETE CASCADE,
  insumo_id              uuid        NOT NULL REFERENCES insumos(id) ON DELETE CASCADE,
  -- Fecha libre, la elige el encargado: no hay período fijo de compra.
  fecha                  date        NOT NULL,
  -- En unidad de compra: 50 bolsas, 12 barras.
  cantidad               numeric     NOT NULL,
  -- Lo pagado por unidad de compra: precio por bolsa, por barra.
  precio_unitario_compra numeric     NOT NULL,
  proveedor              text,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);


-- ── 2. Índices ──────────────────────────────────────────────────
-- El de obra_id es el que usa el listado de compras de una obra; el de
-- insumo_id, el cruce contra el precio presupuestado de cada material.
CREATE INDEX IF NOT EXISTS idx_compras_obra_id   ON compras(obra_id);
CREATE INDEX IF NOT EXISTS idx_compras_insumo_id ON compras(insumo_id);


-- ── 3. Activar RLS ──────────────────────────────────────────────
ALTER TABLE compras ENABLE ROW LEVEL SECURITY;


-- ── 4. Permisos de rol ──────────────────────────────────────────
-- Supabase ya concede estos privilegios por default privileges en el schema
-- public, así que normalmente esto es un no-op. Va explícito porque un 42501
-- por GRANT faltante es indistinguible de un 42501 por RLS.
GRANT SELECT, INSERT, UPDATE, DELETE ON compras TO authenticated;


-- ── 5. Políticas (vía obras) ────────────────────────────────────
-- Una compra pertenece al usuario dueño de su obra. La tabla tiene obra_id
-- directo, así que alcanza con un EXISTS a obras, sin encadenar.
-- Los DROP ... IF EXISTS hacen el bloque re-corrible sin error.
DROP POLICY IF EXISTS "compras_select" ON compras;
CREATE POLICY "compras_select" ON compras FOR SELECT USING (
  EXISTS (SELECT 1 FROM obras WHERE obras.id = compras.obra_id AND obras.user_id = auth.uid())
);

DROP POLICY IF EXISTS "compras_insert" ON compras;
CREATE POLICY "compras_insert" ON compras FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM obras WHERE obras.id = compras.obra_id AND obras.user_id = auth.uid())
);

-- Sin WITH CHECK explícito: Postgres aplica el USING también a la fila nueva.
DROP POLICY IF EXISTS "compras_update" ON compras;
CREATE POLICY "compras_update" ON compras FOR UPDATE USING (
  EXISTS (SELECT 1 FROM obras WHERE obras.id = compras.obra_id AND obras.user_id = auth.uid())
);

DROP POLICY IF EXISTS "compras_delete" ON compras;
CREATE POLICY "compras_delete" ON compras FOR DELETE USING (
  EXISTS (SELECT 1 FROM obras WHERE obras.id = compras.obra_id AND obras.user_id = auth.uid())
);


-- ── 6. Trigger updated_at ───────────────────────────────────────
-- set_updated_at() ya fue definida en 001_initial_schema.sql
DROP TRIGGER IF EXISTS set_compras_updated_at ON compras;
CREATE TRIGGER set_compras_updated_at
BEFORE UPDATE ON compras
FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- ── 7. Verificación ─────────────────────────────────────────────
-- Después de correr esto, las 4 políticas tienen que aparecer acá.
-- Si devuelve 0 filas, el bloque no se aplicó entero.
--
--   select tablename, cmd, policyname from pg_policies
--   where tablename = 'compras' order by cmd;
