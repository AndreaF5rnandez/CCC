import { calcularCantidadMedicion } from "./calculos";
import type {
  CertificacionMedicion,
  MedidaRealEntrada,
  MedidasComputo,
} from "../types";

/**
 * Medidas reales que se editan en el formulario de certificación.
 *
 * En pantalla los cuatro campos son TEXTO, no números: mientras se tipea "3,"
 * no hay número válido todavía, y forzar el parseo en cada tecla pelea con el
 * cursor. Se parsea al calcular y al guardar.
 *
 * Es lógica pura, fuera del componente, por lo mismo que
 * `certificacionSeleccion.ts`: se puede razonar y verificar sin montar React.
 */
export interface MedidasTexto {
  n: string;
  largo: string;
  ancho: string;
  alto: string;
}

export const CAMPOS_MEDIDA = ["n", "largo", "ancho", "alto"] as const;
export type CampoMedida = (typeof CAMPOS_MEDIDA)[number];

/** Etiqueta corta de cada campo, para los labels del formulario. */
export const ETIQUETA_CAMPO: Record<CampoMedida, string> = {
  n: "N",
  largo: "Largo",
  ancho: "Ancho",
  alto: "Alto",
};

/** Número a texto editable: coma decimal y sin separador de miles, que es lo
 *  que `parsearCantidad` sabe leer de vuelta. */
export function numeroATexto(valor: number | null | undefined): string {
  if (valor === null || valor === undefined) return "";
  if (!Number.isFinite(valor)) return "";
  return String(valor).replace(".", ",");
}

function textoANumero(texto: string): number | null {
  const limpio = texto.trim().replace(",", ".");
  if (limpio === "") return null;
  const n = Number(limpio);
  return Number.isFinite(n) ? n : null;
}

/** ¿El texto es un número válido para una dimensión (o está vacío)? */
export function campoValido(texto: string): boolean {
  const limpio = texto.trim().replace(",", ".");
  if (limpio === "") return true;
  const n = Number(limpio);
  return Number.isFinite(n) && n >= 0;
}

/** Las medidas del cómputo original, que es con lo que arranca el formulario:
 *  si el encargado no toca nada, la pared salió como se midió. */
export function medidasDesdeComputo(m: CertificacionMedicion): MedidasTexto {
  return {
    n: numeroATexto(m.n),
    largo: numeroATexto(m.largo),
    ancho: numeroATexto(m.ancho),
    alto: numeroATexto(m.alto),
  };
}

/** Las medidas reales ya guardadas, para precargar el formulario al editar. */
export function medidasDesdeReal(real: MedidasComputo): MedidasTexto {
  return {
    n: numeroATexto(real.n),
    largo: numeroATexto(real.largo),
    ancho: numeroATexto(real.ancho),
    alto: numeroATexto(real.alto),
  };
}

/**
 * Cantidad que sale de las medidas tipeadas.
 *
 * Usa el mismo helper que replica la columna generada de la base
 * (`calcularCantidadMedicion`): las dimensiones vacías valen 1, nunca 0. No se
 * reimplementa la fórmula acá.
 *
 * @returns null si algún campo no es un número válido.
 */
export function cantidadDeMedidas(t: MedidasTexto): number | null {
  if (!CAMPOS_MEDIDA.every((campo) => campoValido(t[campo]))) return null;
  const n = textoANumero(t.n);
  return calcularCantidadMedicion(
    n === null ? 1 : n,
    textoANumero(t.largo) ?? undefined,
    textoANumero(t.ancho) ?? undefined,
    textoANumero(t.alto) ?? undefined,
  );
}

/**
 * ¿El encargado corrigió esta medición?
 *
 * Se compara número contra número, no texto contra texto: "3,00" y "3" son la
 * misma pared. Solo si algo cambió se guarda fila en `mediciones_reales`;
 * dejar los campos como vinieron significa "salió como se midió".
 */
export function difiereDelComputo(
  t: MedidasTexto,
  m: CertificacionMedicion,
): boolean {
  if (!CAMPOS_MEDIDA.every((campo) => campoValido(t[campo]))) return false;
  const original: Record<CampoMedida, number | null> = {
    n: m.n ?? null,
    largo: m.largo ?? null,
    ancho: m.ancho ?? null,
    alto: m.alto ?? null,
  };
  return CAMPOS_MEDIDA.some(
    (campo) => textoANumero(t[campo]) !== original[campo],
  );
}

/** El primer campo inválido de una medición, para nombrarlo en el error. */
export function campoInvalido(t: MedidasTexto): CampoMedida | null {
  return CAMPOS_MEDIDA.find((campo) => !campoValido(t[campo])) ?? null;
}

/**
 * Las medidas reales de un ítem, listas para el payload.
 *
 * Solo entran las mediciones SELECCIONADAS y CORREGIDAS: el backend rechaza
 * medidas reales de una medición que no se certificó, y una medición sin
 * corregir no tiene por qué ocupar una fila.
 *
 * Un campo vacío viaja como `null` explícito (borra la dimensión), no como
 * ausente (que el backend interpretaría como "heredá la del cómputo").
 */
export function medidasRealesDeItem(
  mediciones: CertificacionMedicion[],
  seleccionadas: Set<string>,
  medidas: Record<string, MedidasTexto>,
): MedidaRealEntrada[] {
  const entradas: MedidaRealEntrada[] = [];

  for (const m of mediciones) {
    if (!seleccionadas.has(m.id)) continue;
    const t = medidas[m.id];
    if (!t || !difiereDelComputo(t, m)) continue;

    entradas.push({
      medicion_id: m.id,
      n: textoANumero(t.n),
      largo: textoANumero(t.largo),
      ancho: textoANumero(t.ancho),
      alto: textoANumero(t.alto),
    });
  }

  return entradas;
}
