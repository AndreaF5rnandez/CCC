# Handoff — Desvío de cómputo: base, backend y vista unificada

**Fecha:** 2026-08-18
**Sesión:** prompts 1, 2 y 3 del desvío de cómputo

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

**Prompt 3 — frontend: Certificación pasa de tres sub-solapas a dos.**
- **Registrar e Histórico se fusionaron en "Certificaciones"**; "Compras y precios" quedó igual.
  Botón "Nueva certificación" arriba, lista de las existentes abajo, cada una expandible.
- La pantalla de 1393 líneas se partió en `components/obras/certificacion/`:
  `VistaCertificaciones.tsx` (botón + formulario + lista), `FormularioCertificacion.tsx`
  (sirve para crear y para editar), `TarjetaCertificacion.tsx` (detalle con los dos desvíos)
  y `severidad.tsx` (colores, chips y avisos, antes duplicados). `page.tsx` quedó en ~100 líneas.
- **Medidas reales en el formulario**: cada medición tildada muestra los cuatro campos
  (N, largo, ancho, alto) precargados del cómputo y editables, la cantidad real en vivo, el
  desvío de esa pared y un "Volver al cómputo". Corregir una medida repide el previsto de
  material (con 300 ms de espera y aborto de la request anterior), así que el material se
  actualiza solo.
- **Editar sin re-seleccionar**: el formulario se precarga entero desde la certificación —
  mediciones tildadas, medidas corregidas, material cargado y los materiales no previstos.
- `lib/certificacionMedidas.ts`: lógica pura de las medidas (precarga, parseo, "¿difiere del
  cómputo?", payload). `useCertificaciones` sumó `actualizarCertificacion` (PUT).

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
- **Una medición sin tocar no genera fila**: se compara número contra número, así que "3,00" y
  "3" son la misma pared. Destildar una medición olvida su corrección, para que no reaparezca
  sola al volver a tildarla.
- **Un campo vacío viaja como `null` explícito**, no ausente: el backend interpreta el ausente
  como "heredá la del cómputo", y borrar el alto tiene que borrarlo.
- **Una medida a medio tipear no se manda**: mientras el texto no sea número válido, la
  medición no cuenta como corregida y el previsto no se recalcula con basura. Al guardar sí
  se avisa nombrando la pared y el campo.
- **Ahora todo ítem con mediciones se despliega** (antes solo los de más de una): si no, las
  medidas reales de un ítem de una sola pared quedaban inalcanzables.
- **El desvío de cómputo se pinta con la misma escala que el de material**, y arriba del 10%
  se marca fuerte (negrita y fondo más cargado), para que un 3% y un 40% no griten igual.

## Verificación
55 chequeos contra las funciones reales compiladas (sin tocar la base), todos OK. Backend (30):
herencia de dimensiones, las dos validaciones de pertenencia, desvío por medición/ítem/rubro,
previsto 360 kg → 312 kg con la pared corregida, división por cero, medición borrada,
certificación vieja sin detalle de mediciones, payload viejo sigue válido. Frontend (25):
precarga desde el cómputo, detección de corrección, coma decimal, campos a medio tipear,
payload final y precarga al editar. `tsc --noEmit`, `next lint` y `next build` limpios.
**No cubre**: la ida a Supabase, el RLS real, ni la pantalla corriendo — para eso hacen falta
las migraciones aplicadas y una sesión iniciada.

## Lo que quedó pendiente
- **Correr las migraciones y probar el ciclo completo en Edificio Holanda.** Nada de esto se
  ejercitó contra datos reales todavía.
- Editar una certificación creada ANTES de la migración 012 no trae mediciones tildadas (no
  las tiene guardadas): habría que re-seleccionarlas. No hay ninguna en ese estado hoy.
- Los `medicion_ids` sueltos (sin medidas reales) siguen sin validarse contra el ítem.
- Vista consolidada de desvío de cómputo por obra, y su expresión en plata.
- El desvío de cómputo por rubro se calcula en el backend pero la pantalla todavía no lo
  muestra agrupado: se ve por ítem y por medición.

## Próximos pasos sugeridos
1. Correr `010 → 014` en Supabase y verificar con las consultas del final de cada migración.
2. Probar en Edificio Holanda: crear una certificación con una pared corregida, comprobar que
   el previsto de material se mueve, cerrar, reabrirla y editarla.
3. Vista consolidada de desvíos de la obra (cómputo + material + precio en un solo lugar).

## Archivos clave tocados
- `supabase/migrations/014_mediciones_reales.sql` (verificado, sin cambios)
- `lib/certificacion.ts`, `lib/certificacionMedidas.ts` (nuevo)
- `app/api/certificaciones/route.ts`, `app/api/certificaciones/[id]/route.ts`
- `app/api/certificacion-previsto/route.ts`
- `app/obras/[id]/certificacion/page.tsx` (reescrita, ~100 líneas)
- `components/obras/certificacion/`: `VistaCertificaciones.tsx`, `FormularioCertificacion.tsx`,
  `TarjetaCertificacion.tsx`, `severidad.tsx` (los cuatro nuevos)
- `hooks/useCertificaciones.ts`, `types/index.ts`, `CLAUDE.md`
