'use client';

import {
  ACENTO,
  ACENTO_TEXTO,
  BORDE_SUTIL,
  GLASS_CARD,
  INPUT,
  TEXTO,
  TEXTO_2,
  TEXTO_3,
} from '@/components/ui/estiloPragma';
import type { ControlRango } from '@/types';

/* Qué período se está mirando.
 *
 * El control no es una sola pregunta: "cómo venimos hasta hoy", "cómo nos fue
 * el primer trimestre" y "qué pasó en agosto" son tres preguntas distintas con
 * la misma cascada. Los atajos cubren las tres más comunes; los dos selectores
 * de abajo, cualquier otra.
 *
 * El recorte no se hace acá: viaja al backend y entra al cálculo. Una cascada
 * de tres meses no es la de la obra entera recortada. */

export interface Periodo {
  desde: number;
  hasta: number;
}

export function SelectorPeriodo({
  rango,
  mesActual,
  mesesTotales,
  etiquetaDeMes,
  onCambiar,
  cargando,
}: {
  rango: ControlRango | null;
  mesActual: number | null;
  mesesTotales: number;
  /** Cómo se llama cada mes ("Ago 2026"), para los desplegables. */
  etiquetaDeMes: (mes: number) => string;
  onCambiar: (periodo: Periodo) => void;
  cargando: boolean;
}) {
  // Sin fecha de inicio no hay meses en los que recortar: el aviso de la
  // pantalla ya explica por qué, acá no hay nada que ofrecer.
  if (rango === null) return null;

  const meses = Array.from({ length: mesesTotales }, (_, i) => i + 1);

  const atajos: Array<{ etiqueta: string; periodo: Periodo }> = [
    ...(mesActual !== null
      ? [{ etiqueta: 'Hasta hoy', periodo: { desde: 1, hasta: mesActual } }]
      : []),
    ...(mesActual !== null
      ? [{ etiqueta: 'Este mes', periodo: { desde: mesActual, hasta: mesActual } }]
      : []),
    { etiqueta: 'Toda la obra', periodo: { desde: 1, hasta: mesesTotales } },
  ];

  const esActivo = (periodo: Periodo) =>
    rango.desde === periodo.desde && rango.hasta === periodo.hasta;

  return (
    <section style={GLASS_CARD} className="p-4 flex flex-wrap items-center gap-x-6 gap-y-3">
      <div className="flex items-center gap-2">
        <span
          className="text-xs font-semibold uppercase tracking-wide"
          style={{ color: TEXTO_3 }}
        >
          Período
        </span>
        <div className="flex items-center gap-1.5 flex-wrap">
          {atajos.map((atajo) => {
            const activo = esActivo(atajo.periodo);
            return (
              <button
                key={atajo.etiqueta}
                onClick={() => onCambiar(atajo.periodo)}
                disabled={cargando}
                className="text-xs font-medium px-3 py-1.5 rounded-full transition-colors disabled:opacity-50"
                style={
                  activo
                    ? { background: ACENTO, color: ACENTO_TEXTO, fontWeight: 600 }
                    : { color: TEXTO_2, border: BORDE_SUTIL }
                }
              >
                {atajo.etiqueta}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <span className="text-xs" style={{ color: TEXTO_3 }}>
          Desde
        </span>
        <select
          value={rango.desde}
          disabled={cargando}
          onChange={(e) => {
            const desde = Number(e.target.value);
            // Un rango al revés no significa nada: se arrastra el otro extremo.
            onCambiar({ desde, hasta: Math.max(desde, rango.hasta) });
          }}
          style={{ ...INPUT, appearance: 'none', padding: '6px 10px', fontSize: '13px' }}
        >
          {meses.map((mes) => (
            <option key={mes} value={mes}>
              {etiquetaDeMes(mes)}
            </option>
          ))}
        </select>

        <span className="text-xs" style={{ color: TEXTO_3 }}>
          hasta
        </span>
        <select
          value={rango.hasta}
          disabled={cargando}
          onChange={(e) => {
            const hasta = Number(e.target.value);
            onCambiar({ desde: Math.min(rango.desde, hasta), hasta });
          }}
          style={{ ...INPUT, appearance: 'none', padding: '6px 10px', fontSize: '13px' }}
        >
          {meses.map((mes) => (
            <option key={mes} value={mes}>
              {etiquetaDeMes(mes)}
            </option>
          ))}
        </select>
      </div>

      <span className="text-sm ml-auto" style={{ color: TEXTO }}>
        {cargando ? (
          <span style={{ color: TEXTO_2 }}>Recalculando…</span>
        ) : (
          <>
            Mostrando: <strong>{rango.etiqueta}</strong>
          </>
        )}
      </span>
    </section>
  );
}

export default SelectorPeriodo;
