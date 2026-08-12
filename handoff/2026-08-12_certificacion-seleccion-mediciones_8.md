# Handoff — Selección a nivel medición en Certificación
**Fecha:** 2026-08-12
**Sesión:** continuación — módulo de Certificación, selección por paredes

## Contexto
En obra no se ejecuta el ítem completo de una: se hacen paredes sueltas en distintos momentos.
La selección de Registrar baja un nivel, de ítem a medición, y el previsto pasa a calcularse
sobre la suma de las mediciones tildadas.

## ⚠️ No hace falta SQL nuevo
La columna `certificacion_items.cantidad_ejecutada` **ya existe**: la agregó la migración
`011_certificacion_cantidad_ejecutada.sql` del paso 3, que sigue sin ejecutarse. Guardar ahí la
suma de las mediciones tildadas es todo lo que necesita el histórico para calcular el desvío
sobre lo realmente ejecutado. **Siguen pendientes de correr la 010 y la 011, nada más.**

## Lo que se hizo
- **`GET /api/certificacion-items?obra_id=` (nuevo)** — árbol rubro → ítem → mediciones con
  descripción, dimensiones y `cantidad_calculada`. Una sola consulta anidada: el selector no
  puede pedir las mediciones ítem por ítem.
- **`hooks/useCertificacionItems.ts` (nuevo)** — consume ese endpoint. Reemplaza el uso de
  `usePlanificacion` como fuente del listado, que era un préstamo del paso 4A y no traía
  mediciones.
- **`lib/certificacionSeleccion.ts` (nuevo)** — toda la lógica pura de selección: estado de
  ítem y rubro, cantidad ejecutada, armado del payload y los tres "alternar". Vive fuera del
  componente para poder razonarla y verificarla sin montar React.
- **Selector de tres niveles** en Registrar: rubro → ítem (colapsado) → mediciones. El ítem
  muestra cuántas mediciones tiene y, con selección parcial, "26 / 154" resaltado.
- **Checkbox de tres estados** en ítem y rubro (todas / algunas / ninguna), con `indeterminate`
  escrito sobre el nodo.
- **Tipos nuevos**: `CertificacionMedicion`, `CertificacionItemDisponible`,
  `CertificacionRubroDisponible`, `CertificacionItemsResponse`.
- `tsc --noEmit`, `next lint` y `next build` limpios. Sin `any`.

## Decisiones tomadas
- **Se guarda la cantidad ejecutada por ítem, no qué mediciones se tildaron.** Es el enfoque más
  simple que mantiene el desvío correcto, y no necesita tabla nueva. **Trade-off**: el histórico
  sabe que se ejecutaron 26 m² de Mampostería, pero no que fueron la Pared 5 y la 6. Si el
  cliente quiere ese detalle, la evolución natural es una tabla `certificacion_mediciones`.
- **La cantidad queda congelada al guardar.** Si mañana alguien corrige las dimensiones de la
  Pared 5, el desvío de una certificación vieja no se mueve. Es un cambio respecto del paso 3,
  donde el previsto se recalculaba entero en cada lectura: ahora las recetas y los precios
  siguen recalculándose, pero la cantidad ejecutada no. Para un registro de "esto se hizo tal
  día" congelar es lo correcto, pero conviene confirmarlo con el cliente.
- **Ítems sin mediciones van sin `cantidad_ejecutada`** (NULL en la base = "ítem completo"), así
  usan su cantidad total y el dato guardado no miente.
- **Solo se despliegan los ítems con más de una medición.** Con una sola, tildar el ítem ya es
  toda la decisión y desplegar sería ruido.
- **Click en un ítem parcial completa la selección**, no la vacía: es lo que espera alguien que
  tildó tres paredes y quiere el resto.
- El endpoint de previsto **no se tocó**: ya aceptaba `cantidad_ejecutada` por ítem desde el
  paso 2. La vista solo le manda la suma correcta.

## Verificación
Sobre las funciones reales compiladas, sin tocar la base. Todo OK:
- Mampostería de 154 m² con 4 paredes. Tildo Pared 5 (12) y Pared 6 (14) → cantidad ejecutada 26.
- Previsto con receta de 8 kg/m² → **208 kg = 8,32 bolsas**, no los 1232 kg del ítem completo.
  La proporción da exactamente 26/154.
- Lo guardado (`cantidad_ejecutada: 26`) reproduce esos 208 kg al releer el histórico.
- Tri-estado: ninguna → parcial con una pared → completa al clickear el ítem → vacía al repetir.
- Ítem de una sola medición se tilda directo; ítem sin mediciones usa su total (0) y va sin
  cantidad.
- Rubro tilda y destilda sus 5 mediciones más el ítem sin mediciones.

## Lo que quedó pendiente
- **Nada probado contra la base**: faltan correr la 010 y la 011.
- El histórico muestra la cantidad ejecutada por ítem, no las paredes concretas (ver trade-off).
- Editar una certificación desde la UI (el PUT existe desde el paso 3).
- Deuda vieja: RLS de `planificacion`, factor 12 del hierro, `tsconfig.tsbuildinfo` trackeado.

## Próximos pasos sugeridos
1. Correr `010_certificacion.sql` y `011_certificacion_cantidad_ejecutada.sql`.
2. Probar en Edificio Holanda: expandir Mampostería, tildar dos paredes, ver el previsto
   proporcional en bolsas, guardar y revisar el desvío del histórico.
3. Confirmar con el cliente si alcanza con la cantidad o quiere ver qué paredes se ejecutaron.

## Archivos clave tocados
- `app/api/certificacion-items/route.ts`, `hooks/useCertificacionItems.ts`,
  `lib/certificacionSeleccion.ts` (nuevos)
- `app/obras/[id]/certificacion/page.tsx`, `types/index.ts`
