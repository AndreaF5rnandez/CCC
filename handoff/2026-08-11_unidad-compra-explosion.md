# Handoff — Conversión a unidad de compra en la Explosión de insumos

**Fecha:** 2026-08-11
**Sesión:** continuación — módulo Planificación, vista de Explosión de insumos

## Contexto
Dos pedidos del cliente sobre la explosión: (1) que la unidad de medida se vea en columna
propia, y (2) que además de la cantidad técnica (cemento en kg) se vea cuánto comprar en la
unidad del proveedor (bolsas), con el factor editable porque no hay formato único de mercado.

## ⚠️ ACCIÓN REQUERIDA ANTES DE USAR
**Hay que ejecutar a mano `supabase/migrations/009_unidad_compra.sql` en el SQL Editor de
Supabase.** Hasta que se corra, la explosión sigue funcionando pero sin ninguna conversión
de compra (el endpoint detecta que falta la tabla, avisa por consola y degrada; no rompe).
Sigue pendiente de sesiones anteriores verificar que la 008 esté aplicada.

## Lo que se hizo
- **Columna "Unidad"** en las tres solapas de la explosión (Materiales, Mano de obra, Equipo),
  entre el nombre y el primer mes, fija a la izquierda junto a la de insumo.
- **Migración nueva `supabase/migrations/009_unidad_compra.sql`**: agrega `unidad_compra` y
  `factor_compra` (nullable) a `insumos`, crea `insumo_compra_obra` (override por obra, UNIQUE
  por obra+insumo, CASCADE, RLS desactivado, trigger de updated_at) y precarga por nombre
  cemento→bolsa/25, cal→bolsa/25, hierro torsionado→barra/12. Ladrillos quedan en NULL.
- **Endpoint nuevo `POST /api/insumo-compra-obra`**: guarda o borra el override de una obra y
  devuelve la conversión ya resuelta. Nunca toca la referencia del insumo.
- **`GET /api/explosion-insumos/[obraId]`** ahora trae los overrides de la obra y devuelve por
  insumo `unidad_compra`, `factor_compra`, `factor_origen` y `factor_referencia`.
- **`lib/calculos.ts`**: `resolverCompra()` (precedencia override → referencia) y
  `convertirAUnidadCompra()` (división con redondeo hacia arriba). Fuente única.
- **Vista**: el total de obra muestra kg y bolsas; cada mes con consumo muestra la conversión
  en chico debajo de la cantidad; y bajo el nombre del insumo hay un campito para editar el
  factor, con chip "obra ✕" cuando el valor es propio de esa obra.

## Decisiones tomadas
- **El factor se resuelve en el backend, no en la vista.** El endpoint manda el valor ya
  resuelto y de dónde salió; el frontend solo lo muestra. Evita duplicar la precedencia.
- **Editar el factor desde la explosión SIEMPRE crea override de obra**, nunca pisa la
  referencia. Vaciar el campo (o el chip "obra ✕") borra el override y vuelve a la referencia.
- **Solo se puede editar el factor de insumos que ya tienen conversión definida.** Los que no
  tienen ni referencia ni override se muestran como antes, solo en unidad base. Para darle
  conversión a un insumo nuevo hay que cargarla como referencia (pantalla Insumos, pendiente).
- **Conversión también por mes**, no solo en el total: se ve chica y muteada para no saturar.
  Los meses de la explosión se ensancharon a 106px (el cronograma quedó igual).
- **Degradación si falta la migración**: solo se ignora el error 42P01 (tabla inexistente);
  cualquier otro error de base sigue explotando como corresponde.

## Lo que quedó pendiente
- Correr la migración 009 en Supabase (ver arriba).
- **El factor 12 de "Hierro torsionado" está mal físicamente**: 12 es el largo en metros de la
  barra comercial, pero el insumo está cargado en kg, y los kg por barra dependen del diámetro
  (~4,7 kg en Ø8, ~10,7 kg en Ø12). Se precargó igual porque era el valor pedido y es editable,
  pero conviene confirmarlo con el cliente o separar el hierro por diámetro.
- La pantalla Insumos no expone todavía `unidad_compra` / `factor_compra` de referencia.
- `insumo_compra_obra.unidad_compra` existe en la tabla y la API la acepta, pero la vista solo
  edita el factor (la unidad se hereda de la referencia).

## Próximos pasos sugeridos
1. Ejecutar la migración 009 y verificar en Edificio Holanda: cemento 3.859,30 kg → 155 bolsas,
   cal 6.946,74 kg → 278 bolsas, arena solo en m3.
2. Definir con el cliente qué hacer con el hierro.
3. Agregar los campos de compra de referencia a la pantalla Insumos.

## Archivos clave tocados
- `supabase/migrations/009_unidad_compra.sql` (nuevo)
- `app/api/insumo-compra-obra/route.ts` (nuevo)
- `app/api/explosion-insumos/[obraId]/route.ts`
- `lib/calculos.ts`, `types/index.ts`, `hooks/useExplosionInsumos.ts`
- `app/obras/[id]/planificacion/page.tsx`
