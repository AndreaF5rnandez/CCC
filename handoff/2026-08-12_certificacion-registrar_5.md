# Handoff — Pestaña Certificación y vista de Registrar
**Fecha:** 2026-08-12
**Sesión:** continuación — módulo de Certificación, paso 4A (frontend)

## Contexto
Primera pantalla del módulo: la pestaña Certificación con sus dos sub-solapas, y la vista
"Registrar" completa. El histórico con desvíos queda para el paso 4B.

## Lo que se hizo
- **`components/obras/ObraTabs.tsx` (nuevo)** — header de obra con las cuatro pestañas.
  Estaba duplicado en Cómputo, Presupuesto y Planificación; se extrajo para no dejar una
  cuarta copia y que agregar una pestaña sea un solo cambio.
- **Las tres páginas existentes ahora usan `ObraTabs`.** Se les sacó el `<header>` propio y el
  import muerto de `Link` que quedó.
- **`app/obras/[id]/certificacion/page.tsx` (nuevo)** — sub-solapas Registrar / Histórico, con
  Registrar activa por defecto e Histórico como placeholder.
- **`hooks/useCertificaciones.ts` (nuevo)** — `lista, cargando, error, recargar,
  calcularPrevisto, crearCertificacion, eliminarCertificacion`.
- Vista Registrar: fecha (hoy por defecto) y descripción; ítems agrupados por rubro con
  checkbox por ítem y por rubro; material previsto que se recalcula al cambiar la selección;
  input de cantidad real por material; agregado de material no previsto; guardar y limpiar.
- `tsc --noEmit`, `next lint` y `next build` limpios. Sin `any`.

## Decisiones tomadas
- **La lista de ítems sale de `usePlanificacion`**, no de un endpoint nuevo. El endpoint de
  planificación ya devuelve rubros → ítems con `descripcion`, `unidad_medida` y
  `cantidad_total`, que es exactamente lo que necesita el checklist, y de ahí sale también el
  nombre de la obra. La alternativa era pedir rubros, ítems y mediciones por separado desde el
  cliente, con un N+1.
- **El filtro a solo materiales se hace en la vista**, como quedó decidido en el backend: la API
  manda los tres tipos etiquetados y la pantalla muestra `tipo === 'material'`.
- **El material no previsto sí entró** (era secundario en el pedido). Es un select de insumos
  tipo material que no estén ya en pantalla, y la fila queda marcada con un chip "no previsto".
  Si se agrega uno que ya estaba previsto, se funde con esa fila en vez de duplicarse.
- **Campo vacío ≠ 0.** Un input en blanco se omite al guardar ("no se cargó"); un 0 escrito a
  propósito sí se manda, porque es un dato distinto y el backend lo acepta.
- **El previsto se recalcula con `AbortController`**: dos clicks rápidos no dejan pisado el
  resultado viejo sobre el nuevo.
- **La cantidad real se guarda como texto en el estado** y se parsea al guardar, para no pelear
  con el cursor mientras se escribe. Acepta coma o punto decimal.
- **`hoyISO()` usa fecha local, no UTC**: en Argentina el UTC puede caer un día antes.
- **No se expone cantidad ejecutada parcial en la UI.** El backend y la tabla la soportan
  (migración 011), pero la pantalla manda siempre el ítem completo. Es lo más simple para el
  encargado y el pedido no la pedía acá.

## Lo que quedó pendiente
- **Vista Histórico con desvíos** (paso 4B): hoy es un placeholder.
- **Nada de esto se probó contra la base**: siguen sin correr las migraciones 010 y 011, así que
  la pantalla todavía no pudo guardar una certificación de verdad. Es lo primero a validar.
- Editar una certificación ya guardada desde la UI (el endpoint PUT existe, la pantalla no).
- Deuda vieja: RLS de `planificacion`, factor 12 del hierro, `tsconfig.tsbuildinfo` trackeado.

## Próximos pasos sugeridos
1. Correr `010_certificacion.sql` y `011_certificacion_cantidad_ejecutada.sql` en Supabase.
2. Probar el ciclo real en Edificio Holanda: tildar mampostería, ver el previsto, cargar el
   real y guardar.
3. Construir la vista Histórico (paso 4B).

## Archivos clave tocados
- `app/obras/[id]/certificacion/page.tsx`, `hooks/useCertificaciones.ts`,
  `components/obras/ObraTabs.tsx` (nuevos)
- `app/obras/[id]/medicion/page.tsx`, `app/obras/[id]/presupuesto/page.tsx`,
  `app/obras/[id]/planificacion/page.tsx` (solo el header)
