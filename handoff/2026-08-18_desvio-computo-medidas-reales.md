# Handoff — Desvío de cómputo: tabla de medidas reales y backend

**Fecha:** 2026-08-18
**Sesión:** prompts 1 y 2 del desvío de cómputo

## Contexto
Al certificar, el encargado marca qué mediciones se ejecutaron. Ahora además puede registrar
con qué medidas salieron DE VERDAD (la pared salió más corta, apareció una puerta). El cómputo
original y el presupuesto no se tocan: es una capa aparte para comparar.

## ⚠️ Lo primero: falta correr la migración 014
`supabase/migrations/014_mediciones_reales.sql` **no se aplicó**. Y según el handoff del 12/08
tampoco estaban corridas la 010, 011 y 012. Orden en el SQL Editor de Supabase:
`010 → 011 → 012 → 013 → 014`. Todas re-corribles. La 014 trae al final las consultas de
verificación (4 políticas RLS + `cantidad_calculada` como GENERATED ALWAYS).
Sin ella el módulo sigue andando: el backend detecta el 42P01, avisa por consola qué correr y
guarda la certificación descartando las medidas reales.

## Lo que se hizo

**Prompt 1 — base de datos.** La migración ya estaba escrita en el working tree; la verifiqué
contra el esquema real: tipos `numeric(14,4)` / `numeric(18,4)` idénticos a `mediciones`, misma
fórmula GENERATED, FKs con CASCADE, UNIQUE (certificacion_id, medicion_id), RLS con las 4
políticas encadenando certificaciones → obras, GRANT a `authenticated`, trigger `set_updated_at`.

**Prompt 2 — backend.**
- `lib/certificacion.ts`: `calcularDesvioComputo()` (por medición, ítem y rubro),
  `resolverMedidasReales()` (validación contra el cómputo + herencia de dimensiones),
  `validarMedidasRealesEntrada()`, `aMedidasResueltas()`, y dos loaders con degradación por
  migración faltante. `calcularPrevistoConItems()` acepta el ajuste por medidas reales.
- `POST/PUT /api/certificaciones`: aceptan `medidas_reales` por ítem y las guardan; el PUT las
  reemplaza enteras, como el resto de los hijos.
- `GET /api/certificaciones` y `[id]`: devuelven `desvio_computo` con planificada, real y
  desvío en cantidad y en %.
- `POST /api/certificacion-previsto`: acepta lo mismo y devuelve `desvio_computo`, para que la
  previsualización de Registrar dé el mismo número que el Histórico después de guardar.
- `types/index.ts`: `MedidaRealEntrada`, `MedidasComputo`, `CertificacionMedicionDesvio`,
  `CertificacionDesvioComputoItem`, `CertificacionDesvioComputoRubro`, `CertificacionDesvioComputo`.

## Decisiones tomadas
- **La medida real SÍ recalcula el previsto de material** (indicación del usuario): si una
  pared salió más grande, lleva más ladrillos. El ajuste NO se persiste —
  `certificacion_items.cantidad_ejecutada` guarda siempre la cantidad del cómputo— y se
  recalcula al leer. Por eso `CertificacionItemPrevisto` ahora trae `cantidad_planificada` y
  `ajuste_medidas_reales` además de `cantidad_ejecutada` (que ya es la ajustada).
- **Una dimensión que no viene se hereda del cómputo**; un `null` explícito la borra. Sin esto,
  corregir solo el largo dejaría ancho y alto en NULL y COALESCE los tomaría como 1.
- **No se aceptan medidas reales de una medición que no se certificó**, ni de una medición de
  otro ítem. Se valida contra la base, no en el payload.
- **Nada de totales por rubro en cantidad**: un rubro mezcla m2, m3 y u. El nivel rubro agrupa
  ítems y cuenta cuántos se desviaron.
- Se arregló de paso que la restauración de un PUT fallido perdía las mediciones ejecutadas.

## Verificación
30 chequeos contra las funciones reales compiladas (sin tocar la base), todos OK: herencia de
dimensiones, las dos validaciones de pertenencia, desvío por medición/ítem/rubro, previsto 360
kg → 312 kg con la pared corregida, división por cero, medición borrada, certificación vieja
sin detalle de mediciones, y payload viejo sigue válido. `tsc --noEmit`, `next lint` y
`next build` limpios. **No cubre**: la ida a Supabase ni el RLS real.

## Lo que quedó pendiente
- Correr las migraciones y probar el ciclo completo en Edificio Holanda.
- Frontend: cargar medidas reales en Registrar y mostrar el desvío de cómputo en el Histórico.
- Los `medicion_ids` sueltos (sin medidas reales) siguen sin validarse contra el ítem.
- Vista consolidada de desvío de cómputo por obra, y su expresión en plata.

## Próximos pasos sugeridos
1. Correr `010 → 014` en Supabase y verificar con las consultas del final de cada migración.
2. Pantalla: inputs de medida real por medición en Registrar, con el previsto recalculándose.
3. Bloque de desvío de cómputo en el Histórico, con las cuatro severidades ya usadas.

## Archivos clave tocados
- `supabase/migrations/014_mediciones_reales.sql` (verificado, sin cambios)
- `lib/certificacion.ts`
- `app/api/certificaciones/route.ts`, `app/api/certificaciones/[id]/route.ts`
- `app/api/certificacion-previsto/route.ts`
- `types/index.ts`, `CLAUDE.md`
