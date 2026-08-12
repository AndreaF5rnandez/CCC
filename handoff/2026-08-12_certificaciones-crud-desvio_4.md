# Handoff — CRUD de certificaciones y cálculo de desvío
**Fecha:** 2026-08-12
**Sesión:** continuación — módulo de Certificación, paso 3 (backend)

## Contexto
Tercer paso del módulo. Guardar certificaciones (fecha, ítems ejecutados, material real) y
leerlas con el desvío calculado contra el previsto de las recetas. Solo backend; no se tocó
frontend ni se aplicó la skill de diseño.

## Lo que se hizo
- **`lib/certificacion.ts` (nuevo)** — toda la lógica compartida: carga de ítems para previsto,
  cálculo de previsto, cálculo de desvío, validación del payload, inserción de hijos y lectura
  de certificaciones con desvío.
- **`app/api/certificaciones/route.ts` (nuevo)** — `GET ?obra_id=` (listado con desvío) y `POST`.
- **`app/api/certificaciones/[id]/route.ts` (nuevo)** — `GET` / `PUT` / `DELETE`.
- **`app/api/certificacion-previsto/route.ts` refactorizado** para usar la lib. La cuenta del
  previsto ahora existe en un solo lugar y la comparten el endpoint de preview y el desvío.
- **Migración `011_certificacion_cantidad_ejecutada.sql` (nueva)** — ver abajo.
- **Tipos nuevos** en `types/index.ts`: `Certificacion`, `CertificacionInsumoReal`,
  `DesvioOrigen`, `CertificacionDesvioInsumo`, `CertificacionConDesvio`, `CertificacionRequest`.
- **`CLAUDE.md` actualizado**: las tres tablas de certificación, los endpoints nuevos y la
  convención de que el desvío no se guarda.
- `tsc --noEmit` y `next lint` limpios. Sin `any`.

## ⚠️ Faltan correr DOS migraciones
Ninguna de las dos se ejecutó todavía. En orden:
1. `010_certificacion.sql` (del paso 1)
2. `011_certificacion_cantidad_ejecutada.sql` (nueva)

## Decisiones tomadas
- **Hizo falta una migración nueva.** La regla del desvío dice "la cantidad total del ítem salvo
  que se guarde una cantidad ejecutada parcial", pero la 010 dejó `certificacion_items` con solo
  `(certificacion_id, item_id)`: no había dónde guardar la parcial. La 011 agrega
  `cantidad_ejecutada numeric NULL` (NULL = ítem completo) con CHECK >= 0. Es aditiva.
- **Degradación si falta la 011.** Como se aplica a mano y puede ir por detrás del deploy, tanto
  la lectura como la escritura detectan el 42703, avisan por consola qué migración correr y
  siguen tratando todos los ítems como completos, en vez de romper. Mismo criterio que la 009
  con `insumo_compra_obra`.
- **El desvío incluye los tres tipos de insumo, no solo materiales.** El pedido permitía filtrar
  a material, pero se dejó igual que el previsto del paso 2: todo etiquetado con `tipo` y el
  filtro lo hace la vista. Filtrar en el backend además borraría en silencio un material real
  cargado que fuera de otro tipo.
- **`desvio_pct` es `null` cuando el previsto es 0**, nunca Infinity ni NaN. El campo `origen`
  ("ambos" | "solo_previsto" | "solo_real") dice de qué lado viene cada fila.
- **El cruce es completo, no una intersección.** Un insumo con real y sin previsto y uno con
  previsto y sin real aparecen igual, con el otro lado en 0.
- **No hay transacción real.** Supabase no las expone desde el cliente JS. El POST borra la
  cabecera si fallan los hijos (el CASCADE limpia); el PUT restaura el estado anterior. Si
  además falla esa limpieza, el mensaje de error lo dice en vez de callarlo.
- **El PUT reemplaza los hijos enteros** (borrar y recrear), igual que el PUT de recetas con sus
  ingredientes. **No se puede cambiar de obra**: mover una certificación invalidaría su desvío.
- **Una sola consulta de ítems para todo el listado**, no una por certificación, para no caer en
  un N+1 al abrir una obra con muchas certificaciones.
- **`insumos` puede venir vacío**: se permite registrar la ejecución y cargar el material después.
- **Import type del cliente de Supabase** en `lib/certificacion.ts`, para que las funciones puras
  no arrastren `next/headers` y se puedan ejercitar fuera de Next.

## Verificación
Se ejercitaron las funciones **reales** compiladas desde `lib/certificacion.ts` (no una copia),
sin tocar la base. Todo OK:
- Ítem de 30 m² (25 lad + 8 kg cem + 4 kg cal por m²) → previsto 750 / 240 / 120.
  Real 800 lad → desvío +50 y +6,67%. Cemento 240 → 0 y 0%.
- Cal prevista 120 sin consumo cargado → real 0, desvío −120, −100%, origen `solo_previsto`.
- Arena real 0,5 sin previsto → desvío +0,5, `desvio_pct` **null**, origen `solo_real`.
  Las 4 filas se conservan, ninguna se pierde.
- Parcial de 12 m² → previsto 300; real 330 → +30 y +10%.
- 11 casos de validación (repetidos, negativos, fecha, sin ítems, sin obra_id, y los válidos).

**Un bug encontrado y corregido por esta verificación**: `new Date("2026-02-31")` no da fecha
inválida, JS la corre a marzo, así que una fecha inexistente se aceptaba. Ahora se compara el
ida y vuelta de año/mes/día.

**Falta probar los endpoints contra la base real**, con las migraciones aplicadas. Lo verificado
es la aritmética y las validaciones, no la ida a Supabase ni el shape anidado de PostgREST.

## Lo que quedó pendiente
- Correr las migraciones 010 y 011, y recién ahí probar el ciclo completo end-to-end.
- Verificar el RLS de las tres tablas contra la base (sigue pendiente del paso 1).
- Hook `useCertificaciones` y pantalla de Certificación.
- Deuda vieja: RLS de `planificacion`, factor 12 del hierro, `tsconfig.tsbuildinfo` trackeado.

## Próximos pasos sugeridos
1. Correr 010 y 011 en Supabase.
2. Probar POST → GET → PUT → DELETE con datos reales de Edificio Holanda.
3. Hook y pantalla (ahí sí aplica la skill de diseño).

## Archivos clave tocados
- `lib/certificacion.ts`, `app/api/certificaciones/route.ts`,
  `app/api/certificaciones/[id]/route.ts` (nuevos)
- `supabase/migrations/011_certificacion_cantidad_ejecutada.sql` (nuevo)
- `app/api/certificacion-previsto/route.ts`, `types/index.ts`, `CLAUDE.md`
