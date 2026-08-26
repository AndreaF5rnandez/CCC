'use client';

import {
  AMBAR,
  BORDE_SUTIL,
  GLASS_CARD,
  GRIS_FONDO,
  ROJO,
  ROJO_FONDO,
  TEXTO,
  TEXTO_2,
  TEXTO_3,
  VERDE,
  VERDE_FONDO,
} from '@/components/ui/estiloPragma';
import { formatDesvioPrecio, formatPct, formatPrecio } from '@/lib/formato';
import type { ControlCascada, ControlObraResponse } from '@/types';

/* La cabecera del control: cuatro tiles que contestan "¿cómo va la obra?" y,
 * abajo, la cascada que explica de dónde sale la diferencia entre lo que la
 * obra tenía que costar y lo que está costando. */

/** Un desvío en plata: rojo si costó de más, verde si de menos, gris si es 0. */
function colorPlata(monto: number): string {
  if (monto > 0) return ROJO;
  if (monto < 0) return VERDE;
  return TEXTO_2;
}

function Tile({
  etiqueta,
  valor,
  colorValor,
  detalle,
  pie,
  fondoIcono,
  colorIcono,
  icono,
}: {
  etiqueta: string;
  valor: string;
  colorValor?: string;
  detalle?: string;
  pie?: React.ReactNode;
  fondoIcono: string;
  colorIcono: string;
  icono: string;
}) {
  return (
    <div style={GLASS_CARD} className="p-5 flex flex-col gap-2">
      <div
        className="w-11 h-11 rounded-xl flex items-center justify-center text-lg font-bold"
        style={{ backgroundColor: fondoIcono, color: colorIcono }}
      >
        {icono}
      </div>
      <span
        className="text-2xl font-bold tabular-nums leading-tight"
        style={{ color: colorValor ?? TEXTO }}
      >
        {valor}
      </span>
      <span className="text-sm" style={{ color: TEXTO_2 }}>
        {etiqueta}
      </span>
      {detalle && (
        <span className="text-xs" style={{ color: TEXTO_3 }}>
          {detalle}
        </span>
      )}
      {pie}
    </div>
  );
}

export function ResumenControl({ datos }: { datos: ControlObraResponse }) {
  const { avance, cascada, caja } = datos;

  // Atraso: cuánto falta para llegar a lo que se había planificado para hoy.
  const atraso = avance.certificado_monto - avance.plan_monto;
  const hayPlan = avance.plan_monto > 0;
  /* El plan con el que se compara es el del período elegido, acumulado. Sin
   * nombrarlo, un "70,7%" al lado de un "42%" no dice contra qué se compara. */
  const periodo = datos.rango ? datos.rango.etiqueta.toLowerCase() : 'la obra';

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))' }}>
        <Tile
          icono="%"
          fondoIcono="#F0E6FF"
          colorIcono="#8B5CF6"
          valor={formatPct(avance.certificado_pct).replace('+', '')}
          etiqueta={`Avance certificado, sobre la obra completa de ${formatPrecio(datos.total_presupuesto)}`}
          detalle={
            hayPlan
              ? `El plan pedía ${formatPct(avance.plan_pct).replace('+', '')} para ${periodo}`
              : 'Sin avance planificado cargado para este período'
          }
          pie={
            hayPlan ? (
              <span
                className="text-xs font-semibold px-2 py-0.5 rounded-full self-start"
                style={{
                  background: atraso >= 0 ? VERDE_FONDO : ROJO_FONDO,
                  color: atraso >= 0 ? VERDE : ROJO,
                }}
              >
                {atraso >= 0 ? 'Adelantado ' : 'Atrasado '}
                {formatPrecio(Math.abs(atraso))}
              </span>
            ) : undefined
          }
        />

        <Tile
          icono="$"
          fondoIcono="#FFF3D0"
          colorIcono="#F5A623"
          valor={formatPrecio(avance.certificado_monto)}
          etiqueta="Obra ejecutada, a precio de presupuesto"
          detalle={`Es el mismo ${formatPct(avance.certificado_pct).replace('+', '')} de la izquierda, en pesos`}
          pie={
            avance.crecimiento_alcance_monto !== 0 ? (
              <span
                className="text-xs font-semibold px-2 py-0.5 rounded-full self-start"
                style={{ background: 'rgba(245, 166, 35, 0.15)', color: AMBAR }}
              >
                Además la obra creció {formatPrecio(avance.crecimiento_alcance_monto)}
              </span>
            ) : undefined
          }
        />

        <Tile
          icono="Δ"
          fondoIcono={cascada.desvio_total > 0 ? ROJO_FONDO : VERDE_FONDO}
          colorIcono={cascada.desvio_total > 0 ? ROJO : VERDE}
          valor={formatDesvioPrecio(cascada.desvio_total)}
          colorValor={colorPlata(cascada.desvio_total)}
          etiqueta="Desvío en materiales"
          detalle={
            cascada.desvio_total_pct === null
              ? 'Todavía no hay material certificado'
              : `${formatPct(cascada.desvio_total_pct)} sobre lo presupuestado para lo ejecutado`
          }
        />

        <Tile
          icono="◧"
          fondoIcono="#D5F5F0"
          colorIcono="#14B8A6"
          valor={formatPrecio(caja.comprado)}
          etiqueta="Comprado"
          detalle={`Consumido en obra: ${formatPrecio(caja.consumido)}`}
          pie={
            Math.abs(caja.diferencia) > 0.005 ? (
              <span
                className="text-xs px-2 py-0.5 rounded-full self-start"
                style={{ background: GRIS_FONDO, color: TEXTO_2 }}
              >
                {caja.diferencia > 0
                  ? `${formatPrecio(caja.diferencia)} sin usar todavía`
                  : `${formatPrecio(Math.abs(caja.diferencia))} usados sin compra registrada`}
              </span>
            ) : undefined
          }
        />
      </div>

      <Cascada cascada={cascada} manoObra={datos.mano_obra_certificada} />
    </div>
  );
}

/* ─── La cascada ───────────────────────────────────────────────────────────── */

/**
 * De lo presupuestado al costo real, escalón por escalón.
 *
 * Los tres desvíos no compiten: se encadenan, y la suma cierra exacta. Puede
 * cerrar porque el previsto de material ya se calcula sobre la cantidad REAL de
 * cada medición, así que una pared más grande se cobra una sola vez —en el
 * escalón de cómputo— y el de material mide solo rendimiento.
 */
function Cascada({ cascada, manoObra }: { cascada: ControlCascada; manoObra: number }) {
  const escalones: Array<{ etiqueta: string; explicacion: string; monto: number }> = [
    {
      etiqueta: 'Desvío de cómputo',
      explicacion: 'Las paredes salieron distintas de como se midieron',
      monto: cascada.desvio_computo,
    },
    {
      etiqueta: 'Desvío de material',
      explicacion: 'Se consumió más o menos de lo que la receta pedía',
      monto: cascada.desvio_material,
    },
    {
      etiqueta: 'Desvío de precio',
      explicacion: 'Se pagó distinto a lo presupuestado, sobre lo consumido',
      monto: cascada.desvio_precio,
    },
  ];

  // Para la barrita de magnitud: el escalón más grande manda la escala.
  const mayor = Math.max(...escalones.map((e) => Math.abs(e.monto)), 1);

  return (
    <section style={GLASS_CARD} className="p-5">
      <div className="flex items-baseline justify-between mb-1 gap-3">
        <h3 className="text-base font-semibold" style={{ color: TEXTO }}>
          De lo presupuestado al costo real
        </h3>
        <span className="text-xs" style={{ color: TEXTO_3 }}>
          Solo materiales
        </span>
      </div>
      <p className="text-xs mb-4" style={{ color: TEXTO_3 }}>
        Los tres desvíos se encadenan y la suma cierra exacta: cada peso de diferencia tiene un
        solo responsable.
      </p>

      <div className="flex flex-col">
        <Fila
          etiqueta="Material presupuestado"
          explicacion="Lo que las recetas pedían para las cantidades del cómputo certificado"
          monto={cascada.base_material}
          esTotal
        />

        {escalones.map((e) => (
          <Fila
            key={e.etiqueta}
            etiqueta={e.etiqueta}
            explicacion={e.explicacion}
            monto={e.monto}
            conSigno
            proporcion={Math.abs(e.monto) / mayor}
          />
        ))}

        <Fila
          etiqueta="Costo real de los materiales"
          explicacion="Lo que costaron de verdad los materiales que se consumieron"
          monto={cascada.costo_real}
          esTotal
        />
      </div>

      {manoObra > 0 && (
        <p className="text-xs mt-4 pt-3" style={{ color: TEXTO_3, borderTop: BORDE_SUTIL }}>
          Mano de obra y equipo de lo certificado: <strong>{formatPrecio(manoObra)}</strong>. No
          entran en la cuenta de arriba porque todavía no se carga su consumo real: son
          presupuesto, no control.
        </p>
      )}
    </section>
  );
}

function Fila({
  etiqueta,
  explicacion,
  monto,
  esTotal = false,
  conSigno = false,
  proporcion = 0,
}: {
  etiqueta: string;
  explicacion: string;
  monto: number;
  esTotal?: boolean;
  conSigno?: boolean;
  proporcion?: number;
}) {
  const color = conSigno ? colorPlata(monto) : TEXTO;

  return (
    <div
      className="flex items-center gap-4 py-2.5"
      style={{ borderTop: esTotal ? BORDE_SUTIL : undefined }}
    >
      <div className="flex-1 min-w-0">
        <span
          className="text-sm block"
          style={{ color: TEXTO, fontWeight: esTotal ? 600 : 500 }}
        >
          {conSigno && <span style={{ color: TEXTO_3 }}>+ </span>}
          {etiqueta}
        </span>
        <span className="text-xs" style={{ color: TEXTO_3 }}>
          {explicacion}
        </span>
      </div>

      {/* Barrita de magnitud: se ve de un vistazo cuál de los tres pesa más. */}
      {!esTotal && (
        <div className="hidden sm:block w-28 h-1.5 rounded-full shrink-0" style={{ background: GRIS_FONDO }}>
          <div
            className="h-full rounded-full"
            style={{
              width: `${Math.max(proporcion * 100, monto === 0 ? 0 : 4)}%`,
              background: color,
              opacity: 0.55,
            }}
          />
        </div>
      )}

      <span
        className="text-sm tabular-nums shrink-0 w-32 text-right"
        style={{ color, fontWeight: esTotal ? 700 : 600 }}
      >
        {conSigno ? formatDesvioPrecio(monto) : formatPrecio(monto)}
      </span>
    </div>
  );
}

export default ResumenControl;
