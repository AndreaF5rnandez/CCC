'use client';

import {
  AMBAR,
  AMBAR_FONDO,
  GRIS_FONDO,
  ROJO,
  ROJO_FONDO,
  TEXTO_2,
  VERDE,
  VERDE_FONDO,
} from '@/components/ui/estiloPragma';
import type { CertificacionDesvioInsumo } from '@/types';

/* Severidad y chips del módulo de Certificación.
 *
 * Estaban dentro de la pantalla del histórico. Viven acá porque ahora los usan
 * las dos mitades de la vista unificada (el formulario y la tarjeta), y porque
 * el desvío de CÓMPUTO tiene que pintarse con los mismos colores que el de
 * material: si no, dos desvíos iguales se leerían distinto según la tabla. */

/* Banda de tolerancia, solo de presentación: un desvío de menos de 1% se lee
 * como "en línea" en vez de pintarse de rojo por un decimal. No cambia ningún
 * número, solo el color y la etiqueta. */
export const TOLERANCIA_PCT = 1;

/* Arriba de este porcentaje el desvío se marca fuerte (fondo más cargado y
 * negrita). Es la "magnitud" del alerta: un 3% y un 40% no pueden gritar igual. */
export const DESVIO_FUERTE_PCT = 10;

export type Severidad = 'de_mas' | 'de_menos' | 'en_linea' | 'no_previsto' | 'sin_consumo';

export const COLOR_SEVERIDAD: Record<
  Severidad,
  { texto: string; fondo: string; etiqueta: string }
> = {
  de_mas: { texto: ROJO, fondo: ROJO_FONDO, etiqueta: 'de más' },
  de_menos: { texto: VERDE, fondo: VERDE_FONDO, etiqueta: 'de menos' },
  /* Dentro de tolerancia va GRIS, no verde: un "+92" verde se lee como buena
   * noticia cuando en realidad es "no pasó nada". El verde queda reservado
   * para lo que sí es una noticia: se consumió MENOS de lo previsto. */
  en_linea: { texto: TEXTO_2, fondo: GRIS_FONDO, etiqueta: 'en línea' },
  no_previsto: { texto: AMBAR, fondo: AMBAR_FONDO, etiqueta: 'no previsto' },
  sin_consumo: { texto: TEXTO_2, fondo: GRIS_FONDO, etiqueta: 'sin consumo' },
};

/** Severidad de una fila de desvío de MATERIAL. */
export function clasificar(fila: CertificacionDesvioInsumo): Severidad {
  if (fila.origen === 'solo_real') return 'no_previsto';
  if (fila.origen === 'solo_previsto') return 'sin_consumo';
  if (fila.desvio_pct !== null && Math.abs(fila.desvio_pct) <= TOLERANCIA_PCT) {
    return 'en_linea';
  }
  return fila.desvio_cantidad > 0 ? 'de_mas' : 'de_menos';
}

/**
 * Severidad de un desvío de CÓMPUTO (planificado vs medida real).
 *
 * Acá "de más" es una pared que salió más grande que lo medido. No es un error
 * de consumo sino de cómputo, pero se pinta con la misma escala para que el
 * encargado no tenga que aprender dos códigos de color.
 *
 * Sin porcentaje calculable (planificado 0) manda la diferencia en cantidad.
 */
export function clasificarComputo(
  desvioCantidad: number,
  desvioPct: number | null,
): Severidad {
  if (desvioCantidad === 0) return 'en_linea';
  if (desvioPct !== null && Math.abs(desvioPct) <= TOLERANCIA_PCT) return 'en_linea';
  return desvioCantidad > 0 ? 'de_mas' : 'de_menos';
}

/** ¿El desvío es lo bastante grande como para marcarlo fuerte? */
export function esFuerte(desvioPct: number | null): boolean {
  return desvioPct !== null && Math.abs(desvioPct) > DESVIO_FUERTE_PCT;
}

export function Chip({
  severidad,
  texto,
  fuerte = false,
}: {
  severidad: Severidad;
  texto: string;
  fuerte?: boolean;
}) {
  const color = COLOR_SEVERIDAD[severidad];
  return (
    <span
      className="text-[11px] px-2 py-0.5 rounded-full whitespace-nowrap"
      style={{
        background: color.fondo,
        color: color.texto,
        fontWeight: fuerte ? 600 : 400,
        border: fuerte ? `1px solid ${color.texto}33` : undefined,
      }}
    >
      {texto}
    </span>
  );
}

/** Caja de error, siempre visible en pantalla (nunca solo en consola). */
export function AvisoError({ mensaje }: { mensaje: string }) {
  return (
    <div
      className="p-3 rounded-xl"
      style={{ background: ROJO_FONDO, border: '1px solid rgba(239, 68, 68, 0.30)' }}
    >
      <p className="text-sm font-medium" style={{ color: ROJO }}>
        {mensaje}
      </p>
    </div>
  );
}

export function AvisoExito({ mensaje }: { mensaje: string }) {
  return (
    <div
      className="p-3 rounded-xl"
      style={{ background: VERDE_FONDO, border: '1px solid rgba(34, 197, 94, 0.30)' }}
    >
      <p className="text-sm font-medium" style={{ color: VERDE }}>
        {mensaje}
      </p>
    </div>
  );
}
