-- ================================================================
-- 009_unidad_compra.sql — Conversión a unidad de compra
-- Ejecutar en Supabase SQL Editor
--
-- La explosión de insumos calcula cantidades en la unidad TÉCNICA del insumo
-- (cemento en kg). El usuario compra en otra unidad (bolsas). Esta migración
-- agrega el dato necesario para convertir una en otra, en dos niveles:
--
--   1. Referencia (tabla insumos): unidad_compra + factor_compra. Valor por
--      defecto, compartido por todas las obras.
--   2. Override por obra (tabla insumo_compra_obra): una obra puntual puede
--      pisar el factor sin afectar a las demás.
--
-- El factor SIEMPRE es un valor de referencia editable: el mercado no tiene un
-- formato único (hay bolsas de cemento de 25 y de 50 kg conviviendo), así que
-- ningún valor precargado acá debe tomarse como verdad fija.
-- ================================================================

-- ── 1. Referencia general en insumos ────────────────────────────
-- unidad_compra: en qué unidad se compra (ej: 'bolsa', 'barra').
-- factor_compra: cuántas unidades de unidad_medida entran en una unidad de
--   compra (ej: 25 = 25 kg por bolsa; 12 = 12 m por barra).
-- Ambas nullable: un insumo sin estos campos se comporta como hasta ahora,
-- solo en unidad base.
ALTER TABLE insumos
  ADD COLUMN IF NOT EXISTS unidad_compra text,
  ADD COLUMN IF NOT EXISTS factor_compra numeric;

-- Un factor de 0 o negativo no es convertible (división por cero).
ALTER TABLE insumos
  DROP CONSTRAINT IF EXISTS insumos_factor_compra_positivo;
ALTER TABLE insumos
  ADD CONSTRAINT insumos_factor_compra_positivo
  CHECK (factor_compra IS NULL OR factor_compra > 0);

-- ── 2. Override por obra ────────────────────────────────────────
-- Una fila acá significa: "en ESTA obra, este insumo se compra con este
-- factor", y gana sobre la referencia del insumo. Sin fila → vale la
-- referencia. Borrar la fila = volver a la referencia.
-- unidad_compra es opcional: si viene NULL se hereda la del insumo, y solo se
-- completa cuando la obra también cambia el nombre de la unidad de compra.
CREATE TABLE IF NOT EXISTS insumo_compra_obra (
  id            uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  obra_id       uuid    NOT NULL REFERENCES obras(id)   ON DELETE CASCADE,
  insumo_id     uuid    NOT NULL REFERENCES insumos(id) ON DELETE CASCADE,
  factor_compra numeric NOT NULL,
  unidad_compra text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE(obra_id, insumo_id),
  CHECK (factor_compra > 0)
);

-- La explosión trae todos los overrides de una obra de un saque.
CREATE INDEX IF NOT EXISTS idx_insumo_compra_obra_obra_id
  ON insumo_compra_obra(obra_id);

-- ── RLS por usuario, vía la obra dueña del override ─────────────
-- Mismo patrón que rubros/items/mediciones en 003_rls.sql: la fila no tiene
-- user_id propio, se llega al dueño a través de obras.user_id.
-- (La tabla planificacion quedó sin RLS, pero es la excepción del esquema,
--  no el criterio a seguir.)
ALTER TABLE insumo_compra_obra ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "insumo_compra_obra_select" ON insumo_compra_obra;
CREATE POLICY "insumo_compra_obra_select" ON insumo_compra_obra FOR SELECT USING (
  EXISTS (SELECT 1 FROM obras WHERE obras.id = insumo_compra_obra.obra_id AND obras.user_id = auth.uid())
);

DROP POLICY IF EXISTS "insumo_compra_obra_insert" ON insumo_compra_obra;
CREATE POLICY "insumo_compra_obra_insert" ON insumo_compra_obra FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM obras WHERE obras.id = insumo_compra_obra.obra_id AND obras.user_id = auth.uid())
);

-- Sin WITH CHECK explícito, Postgres aplica el USING también a la fila nueva,
-- que es lo que necesita el upsert (INSERT ... ON CONFLICT DO UPDATE).
DROP POLICY IF EXISTS "insumo_compra_obra_update" ON insumo_compra_obra;
CREATE POLICY "insumo_compra_obra_update" ON insumo_compra_obra FOR UPDATE USING (
  EXISTS (SELECT 1 FROM obras WHERE obras.id = insumo_compra_obra.obra_id AND obras.user_id = auth.uid())
);

DROP POLICY IF EXISTS "insumo_compra_obra_delete" ON insumo_compra_obra;
CREATE POLICY "insumo_compra_obra_delete" ON insumo_compra_obra FOR DELETE USING (
  EXISTS (SELECT 1 FROM obras WHERE obras.id = insumo_compra_obra.obra_id AND obras.user_id = auth.uid())
);

-- ── Trigger para updated_at ─────────────────────────────────────
-- set_updated_at() ya fue definida en 001_initial_schema.sql
DROP TRIGGER IF EXISTS set_insumo_compra_obra_updated_at ON insumo_compra_obra;
CREATE TRIGGER set_insumo_compra_obra_updated_at
BEFORE UPDATE ON insumo_compra_obra
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── 3. Precarga de referencias del mercado argentino ────────────
-- Solo para los insumos que matcheen por nombre. Los que no matcheen quedan en
-- NULL (sin conversión) a propósito: es preferible que el usuario no vea nada
-- antes que ver un factor inventado.
--
-- El `factor_compra IS NULL` del WHERE hace la migración segura de reejecutar:
-- no pisa un valor que el usuario ya haya corregido.

-- Cemento: bolsa de 25 kg (también existen de 50 — el usuario ajusta).
UPDATE insumos
   SET unidad_compra = 'bolsa', factor_compra = 25
 WHERE lower(nombre) = 'cemento'
   AND factor_compra IS NULL;

-- Cal: bolsa de 25 kg.
UPDATE insumos
   SET unidad_compra = 'bolsa', factor_compra = 25
 WHERE lower(nombre) = 'cal'
   AND factor_compra IS NULL;

-- Hierro torsionado: barra de 12.
-- OJO: 12 es el LARGO EN METROS de la barra comercial. Este insumo está
-- cargado en kg, así que 12 no son "12 kg por barra" — los kg por barra
-- dependen del diámetro (una barra de 12 m pesa ~4,7 kg en Ø8 y ~10,7 kg en
-- Ø12). Se precarga igual porque es el valor de referencia pedido, pero es
-- justamente uno de los que hay que corregir por obra/diámetro desde la vista.
UPDATE insumos
   SET unidad_compra = 'barra', factor_compra = 12
 WHERE lower(nombre) = 'hierro torsionado'
   AND factor_compra IS NULL;

-- Ladrillos comunes: NO llevan conversión, se compran por unidad. Quedan en
-- NULL a propósito (no hay UPDATE), y la vista los muestra solo en unidad base.
