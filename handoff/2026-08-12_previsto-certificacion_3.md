# Handoff — Endpoint de material previsto para certificación
**Fecha:** 2026-08-12
**Sesión:** continuación — módulo de Certificación, paso 2 (backend)

## Contexto
Segundo paso del módulo de Certificación. Provee la mitad "prevista" de la comparación:
dado un conjunto de ítems ejecutados, cuánto de cada insumo estaba previsto consumir según
las recetas. Solo backend; no se tocó frontend ni se aplicó la skill de diseño.

## Lo que se hizo
- **Endpoint nuevo `POST /api/certificacion-previsto`** (`app/api/certificacion-previsto/route.ts`).
  Body: `{ obra_id, items: [{ item_id, cantidad_ejecutada? }] }`. Sin `cantidad_ejecutada` se
  asume el ítem completo. Devuelve `{ obra_id, items[], insumos[] }`.
- **Helpers extraídos a `lib/calculos.ts`** para no duplicar la explosión:
  - `metadatosInsumo(insumo)` — copia nombre/unidad/tipo/precio con el `Number()` en un solo lugar.
  - `calcularConsumoIngredientes(ingredientes, cantidadFisica)` — el producto
    `cantidad_fisica × cantidad_en_receta`, ahora con una sola implementación.
  - `calcularCantidadTotalItem` ya existía y se reutilizó tal cual.
- **`app/api/explosion-insumos/[obraId]/route.ts` refactorizado** para usar esos dos helpers.
  Mismo resultado, sin la cuenta repetida en dos endpoints.
- **Tipos nuevos en `types/index.ts`**: `InsumoConsumoBase` (compartido, del que ahora extiende
  `ExplosionInsumo`), `CertificacionItemEjecutado`, `CertificacionPrevistoRequest`,
  `CertificacionItemPrevisto`, `CertificacionInsumoPrevisto`, `CertificacionPrevistoResponse`.
- `npx tsc --noEmit` y `next lint` pasan limpios. Sin `any`.

## Decisiones tomadas
- **POST y no GET**: la lista de ítems es la entrada del cálculo y no entra cómoda en query
  string. No escribe nada en la base.
- **Ruta plana `certificacion-previsto`**, siguiendo `insumo-compra-obra`, para dejar libre
  `/api/certificaciones` para el CRUD que viene.
- **La planificación mensual NO interviene.** La explosión reparte por `pct_plan` de cada mes;
  acá el previsto sale de la cantidad ejecutada. Está aclarado en el comentario del endpoint
  para que nadie los confunda.
- **Se devuelven los tres tipos de insumo etiquetados**, no solo materiales. Filtrar es decisión
  de la vista; descartar en el backend obligaría a tocarlo cuando se sume mano de obra.
- **La respuesta incluye un detalle por ítem** (`cantidad_total`, `cantidad_ejecutada`,
  `origen_cantidad`, `aporta_insumos`). Así un ítem sin receta se ve en vez de desaparecer en
  silencio, y la vista puede mostrar sobre qué cantidad se calculó.
- **Ítems de otra obra se rechazan con 400** listando los ids. El RLS filtra entre usuarios pero
  no entre obras del mismo usuario, así que la pertenencia se valida por `rubros.obra_id`.
- **Un `item_id` repetido en el body es 400**, no se suma ni gana el último: sería ambiguo, y en
  la base un ítem tampoco puede repetirse dentro de una certificación.
- **`cantidad_ejecutada: 0` es válida** (previsto 0); solo se rechazan negativos y no numéricos.

## Verificación manual
No se verificó contra Edificio Holanda: la consulta a la base real quedó cancelada. En su lugar
se ejercitaron los helpers **reales** (compilados desde `lib/calculos.ts`, no una copia) con la
misma agrupación del endpoint, sobre una receta de números redondos. Los 4 casos dan OK:
- Ítem completo de 30 m² con receta de 25 lad + 8 kg cem + 4 kg cal + 1,5 h por m² →
  750 / 240 / 120 / 45. Coincide con la cuenta a mano.
- Parcial de 12 m² sobre los mismos 30 → 300 / 96 / 48 / 18, exactamente 0,4 del completo.
- Dos ítems que comparten cemento y cal → 240 + 600 = 840 kg y 120 + 300 = 420 kg, agrupados
  en una sola fila por insumo y con el tipo correcto.
- Ítem sin receta y cantidad 0 → no rompen, no aportan, y el ítem sin receta igual aparece.

**Falta probar el endpoint contra datos reales de Edificio Holanda**, que era el criterio de
aceptación original.

## Lo que quedó pendiente
- Probar `POST /api/certificacion-previsto` con ítems reales de mampostería de Edificio Holanda.
- Sigue sin ejecutarse `supabase/migrations/010_certificacion.sql` (ver handoff anterior).
- CRUD de certificaciones, hook y pantalla.
- El cálculo de desvío (previsto de este endpoint vs. `certificacion_insumos.cantidad_real`).
- Deuda vieja: RLS de `planificacion`, factor 12 del hierro, `tsconfig.tsbuildinfo` trackeado.

## Próximos pasos sugeridos
1. Correr la migración 010 y probar este endpoint con datos reales.
2. CRUD `POST/GET /api/certificaciones` con ítems e insumos anidados.
3. Endpoint o cálculo de desvío, reutilizando este previsto.
4. Recién después, la pantalla.

## Archivos clave tocados
- `app/api/certificacion-previsto/route.ts` (nuevo)
- `lib/calculos.ts`, `types/index.ts`, `app/api/explosion-insumos/[obraId]/route.ts`
