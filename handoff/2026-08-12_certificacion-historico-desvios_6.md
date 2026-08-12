# Handoff — Vista de histórico y desvíos de certificación
**Fecha:** 2026-08-12
**Sesión:** continuación — módulo de Certificación, paso 4B (frontend)

## Contexto
Segunda y última vista del módulo: el histórico de certificaciones con el desvío por material,
que es el objetivo final del módulo ("control de desvío"). Reemplaza el placeholder del 4A.

## Lo que se hizo
- **Sub-solapa Histórico** en `app/obras/[id]/certificacion/page.tsx`: lista de certificaciones,
  más reciente primero, cada una como tarjeta expandible.
- **Cabecera de cada tarjeta**: fecha formateada, descripción, cantidad de ítems y chips de
  resumen del desvío (cuántos materiales de más, de menos, no previstos y sin consumo). Se lee
  sin expandir.
- **Detalle al expandir**: los ítems ejecutados como chips con su cantidad, y la tabla de desvío
  por material con previsto, real, desvío en cantidad y en porcentaje.
- **Borrado con confirmación en línea** ("¿Borrar? Sí, borrar / Cancelar"), sin modal ni
  `window.confirm`. El error de borrado se muestra dentro de la tarjeta.
- **Estados**: cargando, vacío ("Todavía no registraste certificaciones en esta obra") y error.
- **El hook `useCertificaciones` subió al nivel de la página** y se pasa por props a las dos
  vistas. Antes lo llamaba solo Registrar; ahora lo que se guarda aparece en Histórico sin
  volver a pedirlo al servidor.
- `tsc --noEmit`, `next lint` y `next build` limpios. Sin `any`.

## Decisiones tomadas
- **Banda de tolerancia del 1%, solo de presentación.** Un desvío de menos de 1% se muestra como
  "en línea" en verde en vez de pintarse de rojo por un decimal. No cambia ningún número, solo
  el color. La constante es `TOLERANCIA_PCT`, fácil de mover si el cliente la quiere distinta.
- **Cuatro severidades con color propio**: de más (rojo), de menos (verde), no previsto (ámbar)
  y sin consumo (gris). Las dos últimas llevan además un chip con la etiqueta en la fila, porque
  el color solo no alcanza para explicar por qué el previsto o el real están en 0.
- **Con previsto 0 la columna de porcentaje dice "n/a"**, no un número raro. La diferencia en
  cantidad sí se muestra, que es el dato que sirve ahí.
- **Signo explícito y el mismo glifo de menos** en las dos columnas del desvío: `Intl` usa guión
  y quedaba desparejo al lado del menos tipográfico de la otra columna.
- **Se ordena en la vista, no en el backend.** El endpoint las manda cronológicas (es lo correcto
  para un registro); acá se invierte porque interesa lo último ejecutado.
- **Filtro a materiales en la vista**, coherente con el resto del módulo: la API manda los tres
  tipos etiquetados.
- **Editar no se hizo**, como estaba previsto en el pedido (secundario). El endpoint PUT existe
  desde el paso 3; falta la pantalla.

## Lo que quedó pendiente
- **Editar una certificación desde la UI** (el PUT ya existe).
- **Nada de esto se probó contra la base**: siguen sin correr las migraciones 010 y 011, así que
  el histórico nunca mostró una certificación real. Es lo primero a validar.
- Deuda vieja: RLS de `planificacion`, factor 12 del hierro, `tsconfig.tsbuildinfo` trackeado.

## Próximos pasos sugeridos
1. Correr `010_certificacion.sql` y `011_certificacion_cantidad_ejecutada.sql` en Supabase.
2. Probar el ciclo completo en Edificio Holanda: registrar una certificación, verla en el
   histórico, revisar los colores del desvío y borrarla.
3. Si el flujo cierra con el cliente, agregar la edición.

## Archivos clave tocados
- `app/obras/[id]/certificacion/page.tsx` (único archivo modificado)
