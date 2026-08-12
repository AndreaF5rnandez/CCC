# Handoff — Marcar mediciones ya certificadas
**Fecha:** 2026-08-12
**Sesión:** continuación — módulo de Certificación, evitar duplicados

## Contexto
Una medición ya certificada seguía apareciendo disponible para volver a certificarse, lo que
invitaba a duplicar por error. Ahora se marca, se bloquea, y se puede reabrir a mano.

## La verificación que pedía el prompt: hizo falta tabla nueva
`certificacion_items` guardaba solo `item_id` + `cantidad_ejecutada`, **no** qué mediciones.
Estaba anotado como trade-off explícito en el handoff `..._seleccion-mediciones_8.md`. Sin ese
detalle no se puede marcar una pared puntual, así que se agregó la tabla.

## ⚠️ Migración nueva: 012
**`supabase/migrations/012_certificacion_mediciones.sql`** — hay que correrla en Supabase,
después de la 010 y la 011. El bloque es **re-corrible**: se puede pegar de nuevo sin que aborte
(mismo criterio que se aplicó a la 010 tras el 42501). Al final del archivo quedó la consulta
para confirmar que las 4 políticas se crearon.

Estado de las migraciones pendientes: **010, 011 y 012**.

## Lo que se hizo
- **Tabla `certificacion_mediciones`** (certificacion_id + medicion_id, UNIQUE, CASCADE), con
  RLS y sus 4 políticas encadenadas vía `certificaciones` → `obras`, y GRANT a `authenticated`.
- **`CertificacionItemEjecutado` gana `medicion_ids`**: la vista manda qué paredes se ejecutaron
  y el backend las guarda. No entra al cálculo del desvío, que sigue usando `cantidad_ejecutada`.
- **`GET /api/certificacion-items` devuelve `certificadas`**: qué mediciones de la obra ya se
  certificaron, con la fecha. Va en la misma respuesta que el árbol, en **una sola consulta**
  (`!inner` sobre certificaciones acotando por obra), así la vista no cruza dos llamadas.
- **`lib/certificacionSeleccion.ts`**: concepto de `Disponibilidad` (certificadas + reabiertas)
  y funciones nuevas — `estaDisponible`, `medicionesDisponibles`, `certificadasDelItem`,
  `itemCompletamenteCertificado`, `reabrirMedicionEn`. Los `alternar*` y `estadoDel*` ahora
  reciben la disponibilidad.
- **Vista**: mediciones certificadas atenuadas al 50%, con chip "ya certificada · 12 ago",
  checkbox deshabilitado y botón "Reabrir". Ítem completamente certificado atenuado con chip
  "certificado", sin ocultarse. Indicador de avance por ítem: "2 de 4 certificadas".
- **El PUT también limpia `certificacion_mediciones`** al reemplazar los hijos.
- **Recarga tras guardar**: `useCertificacionItems` expone `recargar()`, que se llama al guardar.
  Sin eso, lo recién certificado seguía apareciendo disponible hasta refrescar la página.
- `CLAUDE.md` actualizado con la tabla y el endpoint.
- `tsc --noEmit`, `next lint` y `next build` limpios. Sin `any`.

## Decisiones tomadas
- **Degradación si falta la 012.** Guardar, leer y editar detectan el 42P01, avisan por consola
  qué correr y siguen: la certificación se guarda igual y no se marca nada. Es exactamente el
  comportamiento anterior, no un error que tire la pantalla abajo.
- **El checkbox del ítem cuenta solo las mediciones DISPONIBLES.** Si de 4 paredes 2 ya están
  certificadas, tildar las 2 restantes deja el ítem en "todas". Contando las 4, el checkbox
  nunca se llenaría y "tildar todo" intentaría recertificar lo ya hecho.
- **Reabrir es de sesión, no se persiste.** Vive en el estado de la pantalla y se limpia al
  guardar. Es una corrección puntual, no un cambio de estado del dato.
- **Una medición reabierta sigue contando en el avance** ("2 de 4 certificadas"): el avance
  refleja lo que hay en la base, no lo que el encargado destrabó para corregir.
- **Los ítems completos no se ocultan**, se atenúan: el encargado quiere ver el avance.
- **El desvío no cambió.** Sigue calculándose sobre `cantidad_ejecutada`; la tabla nueva es solo
  para saber qué ofrecer.

## Verificación
Sobre las funciones reales compiladas, sin tocar la base. Todo OK:
- Con Pared 5 y 6 certificadas: quedan disponibles Pared 1 y 2; avance "2 de 4".
- "Tildar el ítem" tilda solo esas 2 → estado "todas" (sin el filtro daría "algunas" y nunca se
  completaría). Cantidad 40 + 88 = 128, y se guardan los `medicion_ids` correctos.
- Ítem con todas certificadas: no tilda nada, no entra al payload, se marca como completo.
- El atajo de rubro ignora los ítems ya completos.
- Reabrir Pared 5 la devuelve al conjunto tildable, sigue contando en el avance, y reabrir las
  dos del Contrapiso lo saca de "completo".
- Sin nada certificado, el comportamiento previo queda idéntico (tilda las 4, cantidad 154).

## Lo que quedó pendiente
- **Nada probado contra la base**: faltan correr 010, 011 y 012.
- El histórico no muestra qué paredes tuvo cada certificación, aunque el dato ya se guarda.
  Es la mejora natural ahora que existe la tabla.
- Editar una certificación desde la UI (el PUT existe desde el paso 3).
- Deuda vieja: RLS de `planificacion`, factor 12 del hierro, `tsconfig.tsbuildinfo` trackeado.

## Próximos pasos sugeridos
1. Correr 010, 011 y 012 (en ese orden), y confirmar las políticas con la consulta del final
   de cada archivo.
2. Certificar Pared 5 y 6, volver a Registrar y ver que aparecen atenuadas.
3. Mostrar las mediciones ejecutadas en el detalle del histórico.

## Archivos clave tocados
- `supabase/migrations/012_certificacion_mediciones.sql` (nuevo)
- `lib/certificacionSeleccion.ts`, `lib/certificacion.ts`, `types/index.ts`, `CLAUDE.md`
- `app/api/certificacion-items/route.ts`, `app/api/certificaciones/[id]/route.ts`
- `app/obras/[id]/certificacion/page.tsx`, `hooks/useCertificacionItems.ts`
