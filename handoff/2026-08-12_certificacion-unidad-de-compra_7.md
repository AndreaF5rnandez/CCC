# Handoff — Carga del consumo real en unidad de compra
**Fecha:** 2026-08-12
**Sesión:** continuación — módulo de Certificación, ajuste de unidades

## Contexto
En obra nadie pesa el material: el encargado cuenta bolsas. La carga del real pasa a hacerse
en la unidad de compra del insumo cuando está configurada, con el mismo factor que usa la
explosión (override de obra sobre referencia).

## Lo que se hizo
- **`lib/compra.ts` (nuevo)** — `cargarOverridesCompra()`, la carga de overrides de una obra.
  Estaba inline en la explosión; ahora la comparten explosión, certificación y el GET nuevo,
  así el factor no puede divergir entre pantallas.
- **`CertificacionInsumoPrevisto` y `CertificacionDesvioInsumo` ahora extienden `CompraResuelta`**,
  igual que `ExplosionInsumo`. La conversión viaja resuelta desde el backend.
- **`GET /api/insumo-compra-obra?obra_id=` (nuevo)** — conversión resuelta de todos los insumos
  de la obra. Hace falta para los materiales que el encargado agrega a mano: no salen de ninguna
  receta, así que no vienen en la respuesta del previsto, y sin esto usarían la referencia del
  insumo ignorando el override de la obra.
- **`hooks/useConversionesCompra.ts` (nuevo)** — consume ese endpoint.
- **Registrar**: el previsto se muestra en unidad de compra con la base debajo en chico
  ("160 bolsas / 4.000 kg"), la columna de unidad dice en qué se está trabajando, y el input
  lleva la unidad al lado. Decimales permitidos (media bolsa es válida).
- **Histórico**: previsto, real y desvío se muestran en unidad de compra cuando hay factor.
- **Explosión refactorizada** para usar el loader compartido. Sin cambio de comportamiento.
- `tsc --noEmit`, `next lint` y `next build` limpios. Sin `any`.

## Decisiones tomadas
- **Se guarda en unidad BASE**, no en unidad de compra. El encargado escribe bolsas y la vista
  multiplica por el factor antes de mandar. Razones: la base queda toda en la misma unidad, el
  desvío compara contra el previsto sin depender de en qué unidad se cargó, y si mañana cambia
  el factor de la obra los datos históricos no quedan reinterpretados. La conversión es solo de
  presentación y de entrada.
- **El porcentaje de desvío no cambia con la unidad.** Dividir previsto y real por la misma
  constante deja el cociente igual, así que `desvio_pct` sirve para las dos vistas sin recalcular.
- **El previsto en bolsas se muestra con decimales, no redondeado hacia arriba.** Es una
  diferencia deliberada con la explosión: ahí `convertirAUnidadCompra()` redondea hacia arriba
  porque no se compra media bolsa, pero acá el número se compara contra lo que realmente se usó,
  y redondear inventaría un desvío que no existe. **El factor es el mismo**; lo que cambia es el
  redondeo, y solo en la presentación.
- **Sin conversión configurada, factor 1**: la arena se muestra y se carga en m³ como antes, sin
  ninguna rama especial.
- **La unidad se pluraliza de forma simple** (agregar "s"), igual que ya hacía la explosión.

## Verificación
Sobre las funciones reales compiladas, sin tocar la base. Todo OK:
- Ítem de 500 m² con 8 kg/m² → previsto 4.000 kg = **160 bolsas** (factor 25); arena 10 m³.
- Carga de **168 bolsas** → se guardan 4.200 kg; desvío 200 kg = **8 bolsas**, **+5%**.
- El % calculado en bolsas da idéntico al calculado en kg.
- Con **override de obra a 50 kg/bolsa**: previsto 80 bolsas, 84 cargadas → 4.200 kg, +4 bolsas
  y **el mismo +5%**.
- Arena sin conversión: 11,5 m³ cargados contra 10 previstos → +1,5 m³, +15%.
- El factor, la unidad y el origen que resuelve la certificación coinciden exactamente con los
  de la explosión (misma `resolverCompra`).

## Lo que quedó pendiente
- **Nada probado contra la base**: siguen sin correr las migraciones 010 y 011.
- Editar una certificación desde la UI (el PUT existe desde el paso 3).
- La pantalla de Insumos sigue sin exponer `unidad_compra` / `factor_compra` de referencia, así
  que un insumo sin conversión precargada solo se puede cargar en unidad base.
- Deuda vieja: RLS de `planificacion`, factor 12 del hierro, `tsconfig.tsbuildinfo` trackeado.

## Próximos pasos sugeridos
1. Correr `010_certificacion.sql` y `011_certificacion_cantidad_ejecutada.sql`.
2. Probar en Edificio Holanda que el cemento aparece en bolsas y la arena en m³, y comparar el
   factor contra el que muestra la explosión.
3. Definir con el cliente si el previsto en bolsas debería redondearse (hoy va con decimales).

## Archivos clave tocados
- `lib/compra.ts`, `hooks/useConversionesCompra.ts` (nuevos)
- `lib/certificacion.ts`, `types/index.ts`, `app/obras/[id]/certificacion/page.tsx`
- `app/api/insumo-compra-obra/route.ts`, `app/api/certificacion-previsto/route.ts`,
  `app/api/explosion-insumos/[obraId]/route.ts`
