# Handoff — Esquema de base de datos del módulo de Certificación
**Fecha:** 2026-08-12
**Sesión:** continuación — arranque del módulo de Certificación (control de desvío)

## Contexto
Primer paso del módulo de Certificación: el encargado va a registrar ejecuciones reales
(qué ítems se hicieron y cuánto material se consumió de verdad) para después comparar contra
el previsto de la explosión de insumos. Esta sesión fue **solo base de datos**.

## Lo que se hizo
- Migración nueva `supabase/migrations/010_certificacion.sql` con tres tablas:
  - `certificaciones` — obra_id (FK obras, CASCADE), fecha (date, la elige el encargado, sin
    período fijo), descripcion (nullable), created_at / updated_at.
  - `certificacion_items` — certificacion_id (CASCADE), item_id (FK items, CASCADE),
    UNIQUE (certificacion_id, item_id).
  - `certificacion_insumos` — certificacion_id (CASCADE), insumo_id (FK insumos, CASCADE),
    cantidad_real numeric NOT NULL, UNIQUE (certificacion_id, insumo_id).
- Índices por cada FK (obra, certificación, ítem, insumo).
- **RLS activo por usuario en las tres tablas**, con las 12 políticas resueltas vía
  `obras.user_id` (`certificaciones` → obra; las hijas encadenan → `certificaciones` → obra).
- `GRANT SELECT, INSERT, UPDATE, DELETE ... TO authenticated` explícito en las tres.
- Trigger `set_certificaciones_updated_at` en `certificaciones`. La función `set_updated_at()`
  **sí existe** (definida en `001_initial_schema.sql`), así que se aplicó igual que en
  `planificacion`. Las dos tablas hijas no tienen `updated_at` (solo se insertan y borran).
- No se tocó ninguna API, hook ni archivo de frontend.

## ⚠️ Hay que correr la migración a mano
`010_certificacion.sql` **todavía no se ejecutó**. Copiar el archivo entero al SQL Editor de
Supabase y correrlo en un solo bloque: ahora es todo SQL activo, no queda nada comentado
para decidir aparte.

## Decisiones tomadas
- **El consumo real va por certificación, no por ítem.** En obra se hace un pastón y se reparte
  entre varias paredes; separar por ítem sería inventar un dato que nadie mide.
- **RLS activo, no desactivado.** El pedido original decía "igual que items, mediciones y
  planificacion (desactivado)", pero `items` y `mediciones` **sí tienen RLS** desde
  `003_rls.sql`; el que está sin RLS es solo `planificacion`, que es deuda técnica. Sin RLS,
  cualquier usuario autenticado habría visto las certificaciones de todos. Se decidió activarlo.
- **No se agregó `user_id` a las tablas nuevas**: la pertenencia se resuelve vía `obras.user_id`,
  igual que rubros/items/mediciones.
- **Tres ajustes sobre el borrador comentado antes de activarlo:**
  1. Se calificaron todas las columnas (`certificaciones.obra_id` en vez de `obra_id` suelto).
     El borrador usaba alias y referencias sueltas: funcionaba por resolución de nombres hacia
     afuera, pero si mañana alguna tabla del subquery gana una columna con ese nombre, la
     política empieza a comparar contra la columna equivocada **sin dar error**. Es el patrón
     de `003_rls.sql`.
  2. Se agregaron `DROP POLICY IF EXISTS` antes de cada `CREATE`, como en 009, para poder
     re-correr el bloque sin que aborte por política duplicada.
  3. Se agregaron los `GRANT` explícitos a `authenticated`. Supabase ya los da por default
     privileges, así que es un no-op, pero un 42501 por GRANT faltante se ve igual que un
     42501 por RLS y descartarlo de entrada ahorra diagnóstico.
- **Las políticas de las hijas dependen de `certificaciones_select`.** Como el subquery lee
  `certificaciones`, que tiene RLS, la cadena se evalúa con el RLS de esa tabla aplicado. Da el
  mismo conjunto de filas, así que no restringe de más; es la misma mecánica que ya usan
  `items` (vía rubros) y `mediciones` (vía items → rubros) en producción.
- **El UPDATE va sin `WITH CHECK`** en las tres, igual que `insumo_compra_obra`: Postgres aplica
  el USING también a la fila nueva, que es lo que necesitan los upserts.

## Lo que quedó pendiente
- Ejecutar la migración en Supabase.
- **Verificar el RLS contra la base real.** Las políticas se revisaron por lectura contra el
  patrón de `003_rls.sql`, no se ejecutaron. Al correr la migración conviene probar el ciclo
  completo con un usuario: crear una certificación, agregarle ítems e insumos, editar un
  `cantidad_real` y borrar. Si algo devuelve 42501 o listas vacías en silencio, el sospechoso
  es la cadena de las tablas hijas.
- Todo el módulo en sí: tipos, APIs, hooks y pantalla de Certificación.
- Definir cómo se compara real vs. previsto (el previsto sale por ítem de la explosión; el real
  viene agrupado por certificación).
- Deuda vieja que sigue: RLS de `planificacion`, factor 12 del hierro torsionado,
  `tsconfig.tsbuildinfo` trackeado.

## Próximos pasos sugeridos
1. Correr `010_certificacion.sql` en Supabase y verificar las tres tablas.
2. Definir los tipos en `types/index.ts`.
3. APIs de certificaciones (con sus ítems e insumos anidados, estilo `/api/recetas`).
4. Recién después, el cálculo de desvío contra la explosión de insumos.

## Archivos clave tocados
- `supabase/migrations/010_certificacion.sql` (nuevo, único archivo creado)
