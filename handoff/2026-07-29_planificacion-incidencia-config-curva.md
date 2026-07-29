# Handoff — Planificación: Incidencia + Barra de config + Curva acumulada

**Fecha:** 2026-07-29
**Sesión:** sexta del módulo de Planificación (front)

## Contexto
Tarea 6, todo frontend, sobre la grilla ítems × meses de la tarea 5 (autosave, plata por mes,
validación 100%, columnas fijas, rubros colapsables). Tres agregados, sin romper nada de lo anterior.

## Lo que se hizo
Todo en `app/obras/[id]/planificacion/page.tsx` (reescrito, mismos componentes `Grilla` + `Celda`
+ nuevos `ConfigBar` y `CurvaAcumulada`). No se tocó el hook ni ningún endpoint.

- **Columna Incidencia:** nueva columna angosta entre la de ítems (descripción) y Mes 1.
  - Por ítem muestra `incidencia_pct` (ya viene del GET, tarea 2) con un decimal (ej "56,4%").
  - En la fila del rubro muestra la incidencia acumulada = suma de `incidencia_pct` de sus ítems (calculada en front).
  - En el pie ("Plata por mes") muestra la incidencia total (~100%) como referencia.
  - Es informativa, no editable. Queda **fija** al scrollear horizontal (`position: sticky`,
    `left: LEFT_INCID = ANCHO_ITEM`), pegada a la columna de ítems.
- **Barra de configuración (`ConfigBar`)** arriba de la grilla:
  - Selector de fecha (`type=date`) para `fecha_inicio`.
  - Stepper de `plazo_meses` con botones − / + y campo numérico (mínimo 1).
  - Toggle "Relativo" / "Calendario". Calendario queda deshabilitado sin `fecha_inicio`.
  - Persiste con `guardarConfiguracion(plazo, fecha)` del hook (PUT /api/obras/[id], tarea 3).
    Estos dos campos se guardan en la obra, NO en `planificacion`.
  - Modo Calendario es solo etiqueta: el encabezado del mes N = `fecha_inicio + (N−1) meses`
    (helper `etiquetaMesCalendario`, ej "Ago 2026" + subtítulo "Mes N"). El índice guardado en BD
    sigue siendo relativo (1,2,3…). Cambiar la fecha reetiqueta, nunca remapea ni borra %.
  - Al reducir `plazo_meses` por debajo del mes más alto con datos guardados, aparece un **modal de
    confirmación** en vez de borrar en silencio.
- **Curva de inversión acumulada (`CurvaAcumulada`)** debajo de la grilla:
  - SVG inline (línea + área + objetivo total punteado + puntos con tooltip). Eje X = meses (usa las
    mismas etiquetas que el header, relativo o calendario), eje Y = plata acumulada.
  - Acumulado[N] = suma de la plata de los meses 1..N; en el último mes llega al total costo-costo.
  - Se recalcula en vivo con cada edición (deriva de `calc.montoPorMes`, igual que "Plata por mes").
  - Ancho responsivo con `ResizeObserver`.

## Lo que quedó pendiente
- Sigue pendiente ejecutar la migración 008 en Supabase (arrastrado desde tarea 1): sin la tabla
  `planificacion`, `guardarCelda` falla (marca de error por celda).
- La barra de config no muestra spinner por-control (solo un "Guardando…" global sutil). Suficiente.

## Decisiones tomadas
- **Sin librería de gráficos:** no había ninguna en `package.json`. Elegí **SVG inline (0 dependencias)**
  por ser lo más liviano y sobrio, sin `npm install` ni tocar el build. Colores de la paleta glass
  (línea `#2A3300`, área lima translúcida, objetivo punteado gris).
- **Recorte de plazo = ocultar, no borrar:** al reducir el plazo, los % de los meses que quedan fuera
  NO se borran; quedan guardados en BD y reaparecen si se amplía el plazo de nuevo. Es la opción más
  simple y segura. El modal lo explica antes de confirmar.
- **Modo Calendario efectivo:** si el usuario quedó en Calendario y se borra la fecha, cae a Relativo
  automáticamente (`modoEfectivo`), para no romper los encabezados.
- La columna Incidencia usa `left: ANCHO_ITEM` para quedar pegada a la de ítems al fijarse.

## Próximos pasos sugeridos
1. Ejecutar migración 008 en Supabase si aún no se hizo.
2. Probar en vivo: cambiar fecha/plazo y recargar (persisten); toggle Calendario; recorte con datos.

## Archivos clave tocados
- `app/obras/[id]/planificacion/page.tsx` (reescrito: + `ConfigBar`, + `CurvaAcumulada`, + columna Incidencia)

## Verificación
- `npx tsc --noEmit` limpio. `npm run build` OK (ruta planificacion 7.13 kB, sin deps nuevas).
- Intacto de tarea 5: autosave, plata por mes, total por fila 100%, columnas/encabezado fijos, rubros colapsables.
