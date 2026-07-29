# Handoff — Endpoint de Explosión de Insumos (backend)

**Fecha:** 2026-07-29
**Sesión:** continuación — módulo Planificación, tarea backend de explosión de insumos

## Contexto
Tarea solo-backend: endpoint que calcula, a partir de los % de avance del cronograma
(tabla `planificacion`), cuánto de cada insumo se consume por mes. No se tocó frontend ni la vista;
el placeholder de la solapa "Explosión de insumos" queda igual (se reemplaza en la tarea siguiente).

## Lo que se hizo
- **Endpoint nuevo:** `GET /api/explosion-insumos/[obraId]`
  — `app/api/explosion-insumos/[obraId]/route.ts`. Nombre/ruta elegidos por coherencia con
  `/api/presupuesto/[obraId]` y `/api/planificacion/[obraId]` (kebab-case + `[obraId]`).
- **Helper compartido extraído:** `calcularCantidadTotalItem(mediciones)` en `lib/calculos.ts`
  (suma de `cantidad_calculada`). Antes estaba inline en el endpoint de tarea 2; ahora ese endpoint
  (`app/api/planificacion/[obraId]/route.ts`) también lo usa. Fuente única, sin duplicar.
- **Tipos nuevos en `types/index.ts`:** `ExplosionInsumo` y `ExplosionInsumosResponse` (sin `any`).

## Forma de la respuesta
`{ obra_id, obra_nombre, plazo_meses, fecha_inicio, insumos: [...] }`, y por insumo:
`{ insumo_id, nombre, unidad_medida, tipo, precio_unitario, consumo_por_mes[], total }`.
`consumo_por_mes` tiene longitud `plazo_meses` (índice 0 = mes 1); meses sin consumo van en 0.

## Cálculo (por ítem con receta, por mes con % cargado)
`cantidad_fisica = (pct_plan/100) × cantidad_total_item` →
`consumo_insumo = cantidad_fisica × cantidad_en_receta`, agrupando por (insumo, mes).

## Verificación manual con datos reales — Edificio Holanda (plazo 8 meses)
Datos reales usados: ítem **"Mamposteria L.C 0.20"** cantidad_total = **154,372**, mes 1 = **10%**,
receta con **Cemento ×25** por unidad.
- Esperado mes 1 de Cemento = 154,372 × 0,10 × 25 = **385,93** ✅ (coincide con la salida).

Verificación de **agrupación** (un insumo sumado desde varios ítems): **"Costo Horario Ayudante
Albañil"** lo consumen los 5 ítems. Mes 1 = 50,7186 (pilotines) + 25,344 (zapatas2) + 6,912 (zapatas1)
+ 1,1824 (v.encadenado) + 123,4976 (mampostería) = **207,6546** ✅. Total obra de ese insumo = **1534,902**.
La explosión da 2 insumos mano_de_obra (Oficial y Ayudante Albañil) y 4 materiales (Cemento, Arena,
Cal, Ladrillos comunes); ningún insumo se repite.

**Nota sobre cómo se verificó:** el endpoint no se pudo curl-ear anónimo porque `obras`/`insumos`
tienen **RLS por usuario** (sin sesión devuelven vacío → 404) y no había credenciales de login. La
verificación se hizo computando la explosión desde la BD real (service role) con la **fórmula idéntica**
a la del endpoint. `npx tsc --noEmit` limpio y `npm run build` OK.

## Decisiones tomadas
- **Meses fuera de plazo se ignoran:** solo se cuentan `mes` en 1..`plazo_meses`, igual que el
  cronograma (que itera hasta `plazo_meses`). Los % huérfanos de un recorte de plazo no aportan.
- **Lista de insumos = universo de las recetas de la obra:** un insumo que aparece en la receta de un
  ítem se incluye aunque ese ítem no tenga avance (fila de ceros), para no omitir nada y que la vista
  dibuje la grilla completa. La vista puede filtrar `total > 0` si quiere.
- **`tipo` viene tal cual de la BD** (material / mano_de_obra / equipo). Insumos ordenados por tipo y
  luego por nombre, para que la vista los separe en tres solapas fácilmente.

## Lo que quedó pendiente
- Tarea siguiente: construir la vista de la solapa "Explosión de insumos" (frontend) consumiendo este
  endpoint, con tabs por tipo y grilla insumo × mes (usar `plazo_meses`/`fecha_inicio` para el calendario).
- Sigue pendiente (arrastrado): ejecutar la migración 008 en Supabase.

## Archivos tocados
- `app/api/explosion-insumos/[obraId]/route.ts` (nuevo)
- `lib/calculos.ts` (+ `calcularCantidadTotalItem`)
- `app/api/planificacion/[obraId]/route.ts` (usa el helper en vez de la suma inline)
- `types/index.ts` (+ `ExplosionInsumo`, `ExplosionInsumosResponse`)
