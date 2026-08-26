'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { GLASS_CARD, TEXTO, TEXTO_2, TEXTO_3 } from '@/components/ui/estiloPragma';
import { formatPrecio } from '@/lib/formato';
import type { ControlMes, ControlRango } from '@/types';

/* Tres curvas acumuladas sobre el mismo eje: lo que se planificó hacer, lo que
 * se certificó y lo que salió de caja. La distancia entre plan y certificado es
 * el atraso; la que hay entre certificado y gastado es plata adelantada en
 * material que todavía no se convirtió en obra.
 *
 * SVG inline, sin librería de gráficos: el proyecto no tiene ninguna y la curva
 * de Planificación ya se dibuja así. */

const COLOR_PLAN = '#8B5CF6';
const COLOR_CERT = '#2A3300';
const COLOR_GASTO = '#14B8A6';

type Serie = { clave: 'plan_acum' | 'certificado_acum' | 'gastado_acum'; nombre: string; color: string };

const SERIES: Serie[] = [
  { clave: 'plan_acum', nombre: 'Planificado', color: COLOR_PLAN },
  { clave: 'certificado_acum', nombre: 'Certificado', color: COLOR_CERT },
  { clave: 'gastado_acum', nombre: 'Gastado en compras', color: COLOR_GASTO },
];

export function CurvaAvance({
  meses,
  totalPresupuesto,
  rango,
}: {
  meses: ControlMes[];
  totalPresupuesto: number;
  /** El período que se está mirando arriba. La curva NO se recorta: dibuja la
   *  obra entera y sombrea el tramo elegido, porque un tramo sin el resto
   *  alrededor no se puede leer. */
  rango: ControlRango | null;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [ancho, setAncho] = useState(760);
  const [mesActivo, setMesActivo] = useState<number | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const cr = entries[0]?.contentRect;
      if (cr && cr.width > 0) setAncho(cr.width);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const n = meses.length;

  const maxY = useMemo(() => {
    const valores = meses.flatMap((m) => [m.plan_acum, m.certificado_acum, m.gastado_acum]);
    return Math.max(totalPresupuesto, ...valores, 1);
  }, [meses, totalPresupuesto]);

  if (n === 0) {
    return (
      <section style={GLASS_CARD} className="p-5">
        <h3 className="text-base font-semibold mb-1" style={{ color: TEXTO }}>
          Avance mes a mes
        </h3>
        <p className="text-sm" style={{ color: TEXTO_2 }}>
          Para ubicar cada certificación y cada compra en su mes hace falta la fecha de inicio de
          la obra. Se carga en Planificación.
        </p>
      </section>
    );
  }

  const H = 240;
  const padL = 14;
  const padR = 16;
  const padT = 20;
  const padB = 34;
  const plotW = Math.max(ancho - padL - padR, 10);
  const plotH = H - padT - padB;

  const x = (i: number) => padL + (n <= 1 ? plotW / 2 : (i / (n - 1)) * plotW);
  const y = (v: number) => padT + plotH - (v / maxY) * plotH;
  const baseY = padT + plotH;

  const camino = (clave: Serie['clave']) =>
    meses
      .map((m, i) => `${i === 0 ? 'M' : 'L'} ${x(i).toFixed(1)} ${y(m[clave]).toFixed(1)}`)
      .join(' ');

  const yTotal = y(totalPresupuesto);
  const pasoEtiqueta = Math.ceil(n / 12) || 1;
  const indiceActual = meses.findIndex((m) => m.es_actual);
  const primeroEnRango = meses.findIndex((m) => m.en_rango);
  const ultimoEnRango = meses.map((m) => m.en_rango).lastIndexOf(true);
  const hayBanda = rango !== null && primeroEnRango >= 0 && ultimoEnRango > primeroEnRango;
  const detalle = mesActivo !== null ? meses.find((m) => m.mes === mesActivo) : null;

  return (
    <section style={GLASS_CARD} className="p-5">
      <div className="flex items-baseline justify-between mb-3 gap-3 flex-wrap">
        <div>
          <h3 className="text-base font-semibold" style={{ color: TEXTO }}>
            Avance mes a mes
          </h3>
          <p className="text-xs" style={{ color: TEXTO_3 }}>
            Acumulado sobre la obra entera. La distancia entre planificado y certificado es el
            atraso{rango ? `; sombreado, el período que estás mirando arriba` : ''}.
          </p>
        </div>
        <div className="flex items-center gap-4 flex-wrap">
          {SERIES.map((s) => (
            <span key={s.clave} className="flex items-center gap-1.5 text-xs" style={{ color: TEXTO_2 }}>
              <span
                className="inline-block rounded-full"
                style={{ width: 10, height: 10, background: s.color }}
              />
              {s.nombre}
            </span>
          ))}
        </div>
      </div>

      <div ref={ref} style={{ width: '100%' }}>
        <svg width={ancho} height={H} role="img" aria-label="Avance acumulado por mes">
          {/* El período que se está mirando */}
          {hayBanda && (
            <rect
              x={x(primeroEnRango)}
              y={padT}
              width={Math.max(x(ultimoEnRango) - x(primeroEnRango), 1)}
              height={plotH}
              fill="rgba(200, 230, 76, 0.16)"
            />
          )}

          {/* Línea base */}
          <line x1={padL} y1={baseY} x2={padL + plotW} y2={baseY} stroke="rgba(0,0,0,0.10)" />

          {/* Objetivo: el presupuesto completo de la obra */}
          {totalPresupuesto > 0 && (
            <>
              <line
                x1={padL}
                y1={yTotal}
                x2={padL + plotW}
                y2={yTotal}
                stroke="rgba(0,0,0,0.22)"
                strokeDasharray="4 4"
              />
              <text x={padL + 4} y={yTotal - 5} fontSize="10" fill={TEXTO_3}>
                Obra completa · {formatPrecio(totalPresupuesto)}
              </text>
            </>
          )}

          {/* El mes en el que estamos */}
          {indiceActual >= 0 && (
            <line
              x1={x(indiceActual)}
              y1={padT}
              x2={x(indiceActual)}
              y2={baseY}
              stroke="rgba(200,230,76,0.9)"
              strokeWidth={2}
            />
          )}

          {SERIES.map((s) => (
            <path
              key={s.clave}
              d={camino(s.clave)}
              fill="none"
              stroke={s.color}
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          ))}

          {SERIES.map((s) =>
            meses.map((m, i) => (
              <circle
                key={`${s.clave}-${m.mes}`}
                cx={x(i)}
                cy={y(m[s.clave])}
                r={mesActivo === m.mes ? 4 : 2.5}
                fill={s.color}
              />
            )),
          )}

          {/* Zonas invisibles para el hover: una por mes, de arriba a abajo. */}
          {meses.map((m, i) => (
            <rect
              key={`hover-${m.mes}`}
              x={x(i) - plotW / Math.max(n * 2, 1)}
              y={padT}
              width={Math.max(plotW / Math.max(n, 1), 8)}
              height={plotH}
              fill="transparent"
              onMouseEnter={() => setMesActivo(m.mes)}
              onMouseLeave={() => setMesActivo(null)}
            />
          ))}

          {meses.map((m, i) =>
            i % pasoEtiqueta === 0 || m.es_actual ? (
              <text
                key={`lbl-${m.mes}`}
                x={x(i)}
                y={H - 12}
                fontSize="10"
                textAnchor="middle"
                fill={m.es_actual ? TEXTO : TEXTO_3}
                fontWeight={m.es_actual ? 600 : 400}
              >
                {m.etiqueta}
              </text>
            ) : null,
          )}
        </svg>
      </div>

      {/* Detalle del mes bajo el cursor. Va en texto y no en un tooltip
          flotante: se lee igual y no pelea con el scroll. */}
      <div className="h-6 mt-1">
        {detalle && (
          <p className="text-xs tabular-nums" style={{ color: TEXTO_2 }}>
            <strong style={{ color: TEXTO }}>{detalle.etiqueta}</strong>
            {SERIES.map((s) => (
              <span key={s.clave}>
                {' · '}
                <span style={{ color: s.color }}>{s.nombre}</span>{' '}
                {formatPrecio(detalle[s.clave])}
              </span>
            ))}
          </p>
        )}
      </div>
    </section>
  );
}

export default CurvaAvance;
