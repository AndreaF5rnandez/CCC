// Validación de fechas que llegan por API.
//
// Vive suelta porque la comparten la certificación y el registro de compras, y
// porque encierra una trampa que ya nos mordió una vez: `new Date("2026-02-31")`
// NO devuelve fecha inválida — JavaScript corre el día sobrante al mes siguiente
// y da el 3 de marzo. Un `isNaN` sobre eso pasa de largo. La única forma de
// cazar un día que no existe es comparar el ida y vuelta.

const FORMATO_FECHA = /^\d{4}-\d{2}-\d{2}$/;

export type ResultadoFecha =
  | { ok: true; fecha: string }
  | { ok: false; error: string };

/**
 * Valida una fecha AAAA-MM-DD que viene del cliente.
 *
 * Las fechas del sistema son libres (las elige el encargado, no hay período
 * fijo), así que no se valida contra un rango: solo que sea un día real.
 *
 * Los mensajes de error salen tal cual a la pantalla.
 *
 * @param valor Valor crudo del body.
 */
export function validarFechaISO(valor: unknown): ResultadoFecha {
  if (typeof valor !== "string" || !FORMATO_FECHA.test(valor)) {
    return { ok: false, error: "La fecha es obligatoria, con formato AAAA-MM-DD" };
  }

  const [anio, mes, dia] = valor.split("-").map(Number);
  const parseada = new Date(Date.UTC(anio, mes - 1, dia));

  if (
    Number.isNaN(parseada.getTime()) ||
    parseada.getUTCFullYear() !== anio ||
    parseada.getUTCMonth() !== mes - 1 ||
    parseada.getUTCDate() !== dia
  ) {
    return { ok: false, error: `La fecha ${valor} no existe` };
  }

  return { ok: true, fecha: valor };
}
