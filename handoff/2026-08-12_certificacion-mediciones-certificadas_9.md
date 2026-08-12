# Handoff — Módulo de Certificación completo (control de desvío)
**Fecha:** 2026-08-12
**Sesión:** módulo de Certificación, de la base de datos a la pantalla

> Este handoff consolida **toda la sesión**, no solo el último paso. Los handoffs 1 a 8 del
> día tienen el detalle de cada tramo; acá está el estado final y las decisiones que siguen
> vigentes.

## Contexto
Módulo de Certificación: el encargado registra ejecuciones reales de obra (qué se hizo y cuánto
material consumió de verdad) y el sistema calcula el **desvío** contra lo previsto por las
recetas. Es lo que el cliente llama "control de desvío".

## ⚠️ Lo primero: faltan correr TRES migraciones
Ninguna se ejecutó todavía. En este orden, en el SQL Editor de Supabase:

1. `010_certificacion.sql` — tablas base + RLS
2. `011_certificacion_cantidad_ejecutada.sql` — cantidad parcial por ítem
3. `012_certificacion_mediciones.sql` — qué mediciones se ejecutaron

Las tres son **re-corribles**: se pueden pegar de nuevo sin que aborten. La 010 y la 012 traen
al final la consulta para confirmar que las políticas se crearon. **Hasta que no corran, nada
del módulo se probó contra datos reales.**

---

## Base de datos

| Migración | Qué agrega |
|---|---|
| `010_certificacion.sql` | `certificaciones` (obra, fecha libre, descripción), `certificacion_items`, `certificacion_insumos`. Índices, RLS con 12 políticas vía `obras.user_id`, GRANT a `authenticated`, trigger de `updated_at`. |
| `011_certificacion_cantidad_ejecutada.sql` | `certificacion_items.cantidad_ejecutada` (NULL = ítem completo) con CHECK >= 0. |
| `012_certificacion_mediciones.sql` | Tabla `certificacion_mediciones` (certificacion_id + medicion_id) con RLS y sus 4 políticas. |

## Backend

**Endpoints nuevos**
- `POST /api/certificacion-previsto` — material previsto para un set de ítems ejecutados.
  Body `{ obra_id, items: [{ item_id, cantidad_ejecutada? }] }`. **No usa la planificación mensual.**
- `GET/POST /api/certificaciones` — listado con desvío calculado / creación.
- `GET/PUT/DELETE /api/certificaciones/[id]` — el PUT reemplaza los hijos enteros.
- `GET /api/certificacion-items?obra_id=` — árbol rubro → ítem → mediciones + qué mediciones ya
  se certificaron, todo en una consulta.
- `GET /api/insumo-compra-obra?obra_id=` — conversión a unidad de compra ya resuelta.

**Libs nuevas**
- `lib/certificacion.ts` — previsto, desvío, validación del payload, inserción de hijos y
  lectura de certificaciones con desvío.
- `lib/compra.ts` — `cargarOverridesCompra()`, compartida con la explosión.
- `lib/certificacionSeleccion.ts` — selección a nivel medición y disponibilidad. Lógica pura,
  fuera del componente, para poder verificarla sin montar React.

**Deduplicación en `lib/calculos.ts`**: se extrajeron `metadatosInsumo()` y
`calcularConsumoIngredientes()`, que estaban inline en la explosión. La explosión se refactorizó
para usarlas, igual que el loader de overrides. El factor de compra sale de una sola
implementación (`resolverCompra`), así los números coinciden entre pantallas.

## Frontend

- **`components/obras/ObraTabs.tsx`** — el header de obra estaba duplicado en Cómputo,
  Presupuesto y Planificación. Se extrajo antes de agregar la cuarta pestaña; las tres páginas
  existentes ahora lo usan.
- **`app/obras/[id]/certificacion/page.tsx`** — pestaña Certificación con sub-solapas
  **Registrar** (activa) e **Histórico**.
- **Hooks**: `useCertificaciones`, `useCertificacionItems`, `useConversionesCompra`.

**Vista Registrar**
- Fecha (hoy por defecto) y descripción opcional.
- Selector de tres niveles rubro → ítem (colapsado) → mediciones, con checkbox de tres estados.
- Mediciones ya certificadas atenuadas, con chip "ya certificada · 12 ago", checkbox
  deshabilitado y botón "Reabrir". Ítem completo atenuado con chip "certificado", sin ocultarse.
  Avance por ítem: "2 de 4 certificadas".
- Material previsto que se recalcula al cambiar la selección, mostrado **en unidad de compra**
  (bolsas) con la base debajo en chico. Input de real con la unidad al lado, decimales
  permitidos. Se puede sumar material no previsto.
- Guardar / Limpiar, con error y éxito siempre en pantalla.

**Vista Histórico**
- Certificaciones como tarjetas expandibles, más reciente primero, con chips de resumen del
  desvío en la cabecera.
- Al expandir: ítems ejecutados y tabla de desvío por material (previsto, real, desvío en
  cantidad y en %), en unidad de compra cuando hay factor.
- Cuatro severidades: de más (rojo), de menos (verde), no previsto (ámbar), sin consumo (gris).
- Borrado con confirmación en línea.

---

## Decisiones que siguen vigentes

- **El desvío no se guarda**: se recalcula en cada lectura cruzando el previsto de las recetas
  contra `certificacion_insumos.cantidad_real`.
- **El consumo real va por certificación, no por ítem.** En obra se hace un pastón y se reparte
  entre varias paredes.
- **`cantidad_real` se guarda en unidad BASE.** El encargado escribe bolsas y la vista multiplica
  por el factor antes de mandar. Así el desvío no depende de en qué unidad se cargó, y cambiar
  el factor de la obra no reinterpreta los datos viejos.
- **El % de desvío es el mismo en las dos unidades** (dividir por una constante no cambia el
  cociente), así que sirve sin recalcular.
- **Con previsto 0, `desvio_pct` es `null`**, nunca Infinity. El campo `origen` dice de qué lado
  viene cada fila, y el cruce es completo: un material sin previsto y uno previsto sin consumo
  aparecen igual.
- **El previsto en bolsas se muestra con decimales**, a diferencia de la explosión, que redondea
  hacia arriba porque no se compra media bolsa. Acá el número se compara contra lo que se usó, y
  redondear inventaría un desvío. El factor es el mismo; cambia solo el redondeo. **A confirmar
  con el cliente.**
- **La cantidad ejecutada queda congelada al guardar.** Si mañana se corrigen las dimensiones de
  una pared, el desvío de una certificación vieja no se mueve. Las recetas y los precios sí se
  siguen recalculando. **A confirmar con el cliente.**
- **El checkbox del ítem cuenta solo las mediciones disponibles**, no las ya certificadas: si no,
  nunca se llenaría y "tildar todo" intentaría recertificar.
- **Reabrir es de sesión, no se persiste.** Es una corrección puntual, no un cambio de estado.
- **RLS activo en las tres tablas nuevas**, vía `obras.user_id`. El pedido original decía de
  dejarlo desactivado "como items y mediciones", pero esas dos sí tienen RLS desde `003_rls.sql`;
  la única sin RLS es `planificacion`, que es deuda técnica.
- **No hay transacción real** (Supabase no las expone desde el cliente JS). El POST borra la
  cabecera si fallan los hijos; el PUT restaura el estado anterior. Si la limpieza también falla,
  el mensaje de error lo dice.
- **Degradación si falta una migración**: lectura y escritura detectan el 42703 / 42P01, avisan
  por consola qué correr y siguen con el comportamiento previo en vez de romper.
- **El backend devuelve los tres tipos de insumo etiquetados**; filtrar a materiales es decisión
  de la vista.

## Bugs encontrados y corregidos en la sesión

- **`new Date("2026-02-31")` no da fecha inválida**: JS la corre a marzo, así que una fecha
  inexistente pasaba la validación. Ahora se compara el ida y vuelta de año/mes/día.
- **42501 al guardar ("new row violates row-level security policy")**: la 010 no era re-corrible,
  así que al pegarla de nuevo abortaba en el primer `CREATE TABLE` y —como el editor de Supabase
  usa una transacción— no aplicaba ninguna política. Las tablas quedaban con RLS activo y sin
  políticas. Las tres migraciones ahora son re-corribles.
- **Los materiales agregados a mano usaban la referencia del insumo**, ignorando el override de
  la obra. Se agregó el `GET /api/insumo-compra-obra` para resolverlo con el mismo factor.

## Verificación

Cinco tandas, siempre ejercitando las **funciones reales compiladas** (no copias) y sin tocar la
base. Todas OK:
1. **Previsto**: ítem completo, parcial proporcional, insumo compartido por dos ítems, ítem sin receta.
2. **Desvío**: +5%, división por cero evitada, cruce completo, 11 casos de validación.
3. **Unidad de compra**: 160 bolsas de previsto, 168 cargadas → 4.200 kg, +8 bolsas y +5%;
   con override a 50 kg/bolsa el % no cambia; el factor coincide con el de la explosión.
4. **Selección por mediciones**: 26 de 154 m² → 208 kg y no 1232; proporción exacta 26/154.
5. **Mediciones certificadas**: disponibilidad, tri-estado, ítem completo, rubro, reabrir.

**Lo que esto NO cubre**: la ida a Supabase, el shape anidado de PostgREST y el RLS real.

## Lo que quedó pendiente

- **Correr las tres migraciones y probar el ciclo completo en Edificio Holanda.**
- Editar una certificación desde la UI (el `PUT` existe, la pantalla no).
- Mostrar en el histórico qué mediciones tuvo cada certificación (el dato ya se guarda).
- Confirmar con el cliente el redondeo del previsto en bolsas y el congelado de la cantidad.
- La pantalla de Insumos no expone `unidad_compra` / `factor_compra` de referencia.
- Deuda vieja: RLS de `planificacion`, factor 12 del hierro torsionado,
  `tsconfig.tsbuildinfo` trackeado (conviene sacarlo del índice y al `.gitignore`).

## Commits de la sesión
`d440e0a` CRUD y desvío · `c461aef` pestaña y vista de registrar · `b2e7683` histórico y desvíos ·
`a54f120` unidad de compra · `2e1c6cc` selección por mediciones · `6535581` mediciones certificadas.
(Los dos primeros del módulo, `1989539` esquema y `7774d69` previsto, ya estaban en `origin/main`.)

## Archivos clave del módulo
- **SQL**: `supabase/migrations/010_certificacion.sql`, `011_certificacion_cantidad_ejecutada.sql`,
  `012_certificacion_mediciones.sql`
- **Libs**: `lib/certificacion.ts`, `lib/certificacionSeleccion.ts`, `lib/compra.ts`, `lib/calculos.ts`
- **API**: `app/api/certificaciones/route.ts`, `app/api/certificaciones/[id]/route.ts`,
  `app/api/certificacion-previsto/route.ts`, `app/api/certificacion-items/route.ts`,
  `app/api/insumo-compra-obra/route.ts`, `app/api/explosion-insumos/[obraId]/route.ts`
- **Front**: `app/obras/[id]/certificacion/page.tsx`, `components/obras/ObraTabs.tsx`,
  `hooks/useCertificaciones.ts`, `hooks/useCertificacionItems.ts`, `hooks/useConversionesCompra.ts`
- **Otros**: `types/index.ts`, `CLAUDE.md`
