# Handoff — Pestaña Control: los tres desvíos en plata

**Fecha:** 2026-08-26
**Sesión:** continuación (sigue a `2026-08-18_desvio-computo-medidas-reales.md`)

## Contexto
Las migraciones `010 → 014` **ya se corrieron** y el módulo de Certificación se probó contra
datos reales en Edificio Holanda. Con eso funcionando, se construyó la vista que faltaba: una
pestaña que junta los tres desvíos —cómputo, material y precio— expresados en pesos.

## Lo que se hizo

**Arreglos previos** (commit `770f0c9`)
- `pluralizar()` en `lib/formato.ts` le agregaba una "s" a cualquier unidad: se veía "20 m3s" y
  "10.108 us". Ahora distingue símbolos (m3, m2, u, kg) de palabras de unidad de compra
  ("bolsa" → "bolsas"). Arregla las tres tablas de Certificación y las dos de Compras a la vez.
- Un desvío dentro de la tolerancia del 1% se pintaba verde. Ahora va gris, en Certificación y
  en Compras: el verde queda para lo que sí es buena noticia.

**Pestaña Control** (commit `0d09f97`) — quinta pestaña de obra, después de Certificación.
- `lib/control.ts` + `GET /api/control/[obraId]`: cruzan planificación, certificación y compras
  en una sola pasada. Acepta `?desde=&hasta=` en meses de obra.
- `hooks/useControlObra.ts`, `app/obras/[id]/control/page.tsx` y `components/obras/control/`:
  `ResumenControl` (cuatro tiles + la cascada), `CurvaAvance` (plan vs certificado vs gastado),
  `TablasControl` (por rubro y por material), `SelectorPeriodo`.
- En Planificación, la grilla y la curva ahora muestran qué % de la obra es cada mes.

## Decisiones tomadas
- **Los tres desvíos se encadenan en una cascada que CIERRA EXACTA**:
  `material presupuestado + cómputo + material + precio = costo real`. Cierra sin doble conteo
  porque el previsto de material ya se calcula sobre la cantidad real (decisión del 18/08).
- **El desvío de precio se valoriza sobre lo CONSUMIDO**, no sobre lo comprado: así la cascada
  cierra contra el costo de lo ejecutado. Lo comprado y sin usar se informa aparte, en la caja.
- **Solo materiales**: es lo único con consumo real cargado. La mano de obra certificada se
  informa al lado, marcada como sin control, en vez de entrar con desvío cero fingido.
- **El avance se mide contra el CÓMPUTO** (el plan está escrito como % del cómputo). Lo que la
  obra creció por medidas reales va en su propia línea y no infla el avance.
- **El filtro entra al cálculo, no recorta totales**: la cascada de tres meses es la de esos
  tres meses. El default es "hasta hoy"; comparar lo hecho contra el plan completo diría que
  vamos atrasados siempre.
- **La curva nunca se recorta**: dibuja la obra entera y sombrea el período elegido.
- **Por rubro solo va el desvío de cómputo**: el de material se carga por certificación (en obra
  se hace un pastón y se reparte), así que repartirlo por rubro sería inventar un dato.

## Lo que quedó pendiente
- **Decidir cómo se cuentan los meses.** Hoy se cuenta por mes de CALENDARIO. Como Edificio
  Holanda arranca el 24/06, el "mes 1" son 7 días. La alternativa es contar de aniversario a
  aniversario (24/06 al 23/07). Cambia en qué mes cae cada certificación. Se cambia solo en
  `mesDeFecha()` de `lib/control.ts`.
- La unidad del ítem "Mamposteria L.C 0.20 cm" está en **cm2** y debería ser m2. Es dato del
  cómputo, se corrige en la pestaña Cómputo. No afecta ningún cálculo, solo la etiqueta.
- Faltan cargar compras: hay materiales consumidos sin ninguna compra registrada (Cal y
  Ladrillos), y se valorizan al precio presupuestado. La pantalla lo avisa.
- Deuda vieja: RLS de `planificacion`, `tsconfig.tsbuildinfo` y `dev-server.log` trackeados.

## Próximos pasos sugeridos
1. Resolver lo de los meses (calendario vs aniversario) antes de que se acumulen datos.
2. Cargar las compras faltantes y verificar que la caja del Control cierre.
3. Evaluar llevar el control a mano de obra: hoy es el único de los tres que no se mide.

## Verificación
54 chequeos contra las funciones reales compiladas, todos OK: 32 del control (la cascada cierra
exacta, avance, caja, curva, tablas y bordes) y 22 del filtro por período (mes suelto, primeros
N meses, obra completa, rango al revés, mes fuera de plazo). `tsc`, `next lint` y `next build`
limpios. Además se probó **en el navegador con datos reales** de Edificio Holanda.

## Archivos clave tocados
- `lib/control.ts` (nuevo), `app/api/control/[obraId]/route.ts` (nuevo)
- `hooks/useControlObra.ts` (nuevo), `app/obras/[id]/control/page.tsx` (nuevo)
- `components/obras/control/`: `ResumenControl`, `CurvaAvance`, `TablasControl`,
  `SelectorPeriodo` (los cuatro nuevos)
- `components/obras/ObraTabs.tsx`, `app/obras/[id]/planificacion/page.tsx`
- `lib/formato.ts`, `components/obras/certificacion/severidad.tsx`,
  `components/obras/VistaCompras.tsx`
- `types/index.ts`, `CLAUDE.md`
