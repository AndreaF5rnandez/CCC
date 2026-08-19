# CLAUDE.md — Presupuestador de Obras (Pragma)

## Qué es
Sistema de presupuestación de obras de construcción. Reemplaza Excel/Presto/Data Obra. El presupuestador solo mide; el sistema calcula el resto.

## Stack
- Next.js 14, App Router, TypeScript
- Tailwind CSS con paleta `pragma-*` (ver abajo)
- Supabase (PostgreSQL): `lib/supabase.ts` (cliente) / `lib/supabaseServer.ts` (servidor)

## Base de datos — tablas clave
| Tabla | Columnas relevantes |
|---|---|
| `insumos` | id, nombre, unidad_medida, tipo (material\|mano_de_obra\|equipo), precio_unitario |
| `recetas` | id, nombre, unidad_medida — **precio NO se guarda, se calcula siempre** |
| `receta_insumos` | id, receta_id, insumo_id, cantidad — CASCADE al eliminar |
| `obras` | id, nombre, cliente, direccion?, fecha_inicio?, estado (activa\|pausada\|finalizada) |
| `rubros` | id, obra_id, nombre, orden — CASCADE al eliminar obra |
| `items` | id, rubro_id, receta_id, descripcion, orden — CASCADE/RESTRICT en receta |
| `mediciones` | id, item_id, descripcion, n, largo?, ancho?, alto?, **cantidad_calculada** GENERATED |
| `certificaciones` | id, obra_id, fecha, descripcion? — CASCADE al eliminar obra |
| `certificacion_items` | id, certificacion_id, item_id, cantidad_ejecutada? (NULL = ítem completo) — UNIQUE (certificacion_id, item_id) |
| `certificacion_insumos` | id, certificacion_id, insumo_id, cantidad_real — UNIQUE (certificacion_id, insumo_id) |
| `certificacion_mediciones` | id, certificacion_id, medicion_id — qué mediciones se ejecutaron; UNIQUE (certificacion_id, medicion_id) |
| `mediciones_reales` | id, certificacion_id, medicion_id, n?, largo?, ancho?, alto?, **cantidad_calculada** GENERATED — medidas con las que salió de verdad cada medición; UNIQUE (certificacion_id, medicion_id); fila opcional: si no hay, salió como se planificó |
| `compras` | id, obra_id, insumo_id, fecha, cantidad, precio_unitario_compra, proveedor? — cantidad y precio en **unidad de COMPRA**; SIN UNIQUE: varias compras del mismo insumo por obra |

**Reglas críticas de DB:**
- `cantidad_calculada` = `n × COALESCE(largo,1) × COALESCE(ancho,1) × COALESCE(alto,1)` — GENERATED ALWAYS, nunca enviarlo desde backend
- Columnas reales: `unidad_medida`, `precio_unitario` (NO `unidad` ni `precio`)
- **RLS activo por usuario** en obras, insumos, recetas, receta_insumos, rubros, items,
  mediciones e insumo_compra_obra (ver `003_rls.sql` y `009_unidad_compra.sql`). Las tablas
  hijas no tienen `user_id`: llegan al dueño con un EXISTS vía `obras.user_id` (o
  `recetas.user_id`). Una tabla nueva colgada de una obra necesita sus 4 políticas.
- Excepción: `planificacion` quedó sin RLS. Es una deuda, no el criterio a copiar.

## APIs disponibles
- `GET/POST /api/insumos` — filtro `?tipo=`
- `GET/PUT/DELETE /api/insumos/[id]` — DELETE verifica uso en recetas
- `GET/POST /api/recetas` — trae ingredientes con insumos anidados
- `GET/PUT/DELETE /api/recetas/[id]` — PUT elimina y recrea ingredientes
- `GET/POST /api/obras` — filtro `?estado=`
- `GET/PUT/DELETE /api/obras/[id]` — DELETE pide `?confirmar=true` si tiene rubros
- `GET/POST /api/rubros` — GET requiere `?obra_id=uuid`; orden automático
- `GET/PUT/DELETE /api/rubros/[id]`
- `GET/POST /api/items` — GET requiere `?rubro_id=uuid`; orden automático
- `GET/PUT/DELETE /api/items/[id]`
- `GET/POST /api/mediciones` — GET requiere `?item_id=uuid`
- `GET/PUT/DELETE /api/mediciones/[id]`
- `GET /api/presupuesto/[obraId]` — `?gastos_generales=10&beneficio=15&impuestos=21`
- `POST /api/certificacion-previsto` — material previsto para un set de ítems ejecutados;
  body `{ obra_id, items: [{ item_id, cantidad_ejecutada?, medicion_ids?, medidas_reales? }] }`.
  NO usa la planificación mensual. Devuelve también `desvio_computo` para previsualizarlo.
- `GET /api/certificacion-items` — requiere `?obra_id=uuid`; árbol rubro→ítem→mediciones
  + qué mediciones ya se certificaron
- `GET/POST /api/certificaciones` — GET requiere `?obra_id=uuid`; trae el desvío de material
  y el `desvio_computo` (por medición, por ítem y agrupado por rubro), ambos calculados
- `GET/PUT/DELETE /api/certificaciones/[id]` — PUT reemplaza ítems, insumos, mediciones
  ejecutadas y medidas reales enteros
- `GET/POST /api/compras` — GET requiere `?obra_id=uuid`; devuelve `{ obra_id, compras, consolidado }`
  con el desvío de PRECIO por compra y el consolidado por insumo (promedio ponderado)
- `GET/PUT/DELETE /api/compras/[id]` — PUT no permite mover la compra de obra

## Hooks
- `useInsumos(tipo?)`, `useRecetas()`, `useObras(estado?)`, `useMediciones(obraId)`
- `useRubros(obraId)`, `useItems(rubroId)` (nuevos)
- Todos exponen: `lista, cargando, error, crear*, actualizar*, eliminar*`
- `usePresupuesto(obraId)` — trae `GET /api/presupuesto/[obraId]` completo (solo lectura, sin CRUD); expone `lista, cargando, error`

## Estado actual del frontend
- Layout + Sidebar funcionando
- `app/insumos/page.tsx` — construida, mejoras pendientes
- `app/obras/page.tsx` — lista de obras funcionando
- `app/obras/[id]/page.tsx` — hub de obra con links a Cómputo y Presupuesto
- `app/obras/[id]/medicion/page.tsx` — cómputo métrico con rubros, ítems y mediciones inline
- `app/recetas/page.tsx` — construida
- `app/obras/[id]/certificacion/page.tsx` — sub-solapas Registrar, Histórico y Compras y precios
- `components/obras/VistaCompras.tsx` — registro de compras + desvío de precio consolidado
- `components/ui/estiloPragma.ts` (tokens glass) y `lib/formato.ts` (números, fechas, unidades)
  son compartidos: no volver a definirlos dentro de una página

## Pendiente
1. Mejoras pantalla Insumos: unidades como select (m2, u, m, m3, kg, km, t, l, h, d, a, ha, cm3, cm2, dm3, mu, cu, mes + "Otra"), tipos personalizados, carga Enter-to-next
2. Pantalla Recetas completa con CRUD de ingredientes
3. Pantalla Presupuesto (`app/obras/[id]/presupuesto/page.tsx`)

## Paleta Tailwind (pragma)
```
pragma-sidebar:     #3B302B
pragma-accent:      #8B5E3C
pragma-fondo:       #F8F4EE
pragma-superficie:  #E4DDCC
pragma-totales:     #5C3A1E
pragma-texto:       #1C1410
pragma-textoClaro:  #7A6A5A
```

## Convenciones
- Sin `any` en TypeScript
- `'use client'` en todo componente con hooks o eventos
- Formularios sin `<form>` HTML — usar `onClick`/`onChange`
- Errores siempre visibles en pantalla, nunca solo en consola
- El presupuesto no se guarda: se calcula al momento desde mediciones + recetas + insumos
- El desvío de certificación tampoco se guarda: se calcula al leer, cruzando el previsto de
  las recetas contra `certificacion_insumos.cantidad_real`
- El desvío de CÓMPUTO tampoco se guarda: se calcula al leer, comparando
  `mediciones.cantidad_calculada` (planificado) contra `mediciones_reales.cantidad_calculada`
  (real). Las medidas reales NO modifican el cómputo original ni el presupuesto
- Cuando una medición tiene medida real, el previsto de MATERIAL de su ítem se calcula sobre
  la cantidad REAL (una pared más larga lleva más ladrillos). El ajuste no se persiste:
  `certificacion_items.cantidad_ejecutada` guarda siempre la cantidad del cómputo y el ajuste
  se recalcula al leer
- El desvío de PRECIO tampoco se guarda: se calcula al leer, comparando
  `compras.precio_unitario_compra` contra `insumos.precio_unitario × factor_compra`
- La conversión a unidad de compra sale SIEMPRE de `resolverCompra()` (`lib/calculos.ts`):
  la usan la explosión, la certificación y las compras, para que los números coincidan
