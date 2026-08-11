'use client';

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { usePlanificacion } from '@/hooks/usePlanificacion';
import { useExplosionInsumos } from '@/hooks/useExplosionInsumos';
import { convertirAUnidadCompra } from '@/lib/calculos';
import type { PlanificacionResponse, ExplosionInsumo } from '@/types';

/* ─── Estilo base (skill de diseño) ────────────────────────────────────────── */

const MESH_GRADIENT = [
  'radial-gradient(ellipse at 15% 80%, rgba(200, 230, 76, 0.12) 0%, transparent 50%)',
  'radial-gradient(ellipse at 85% 20%, rgba(200, 180, 220, 0.15) 0%, transparent 50%)',
  'radial-gradient(ellipse at 80% 85%, rgba(180, 220, 210, 0.12) 0%, transparent 50%)',
  'radial-gradient(ellipse at 50% 50%, rgba(215, 210, 220, 0.3) 0%, transparent 70%)',
  'linear-gradient(135deg, #D8D6DE 0%, #CDCBD5 50%, #D2D0D8 100%)',
].join(', ');

const GLASS_CARD: React.CSSProperties = {
  background: 'rgba(255, 255, 255, 0.55)',
  backdropFilter: 'blur(20px)',
  WebkitBackdropFilter: 'blur(20px)',
  border: '1px solid rgba(255, 255, 255, 0.60)',
  borderRadius: '16px',
  boxShadow: '0 8px 32px rgba(0, 0, 0, 0.06)',
};

/* Fondos casi opacos para celdas sticky: al flotar sobre el contenido que
 * scrollea necesitan tapar lo de atrás, por eso la opacidad alta. */
const BG_STICKY_LEFT = 'rgba(244, 243, 247, 0.96)';
const BG_HEADER = 'rgba(238, 237, 243, 0.96)';
const BG_CORNER = 'rgba(234, 233, 240, 0.98)';
const BG_FOOTER = 'rgba(236, 240, 224, 0.98)';
const BG_RUBRO_LEFT = 'rgba(236, 240, 224, 0.97)';
const BG_RUBRO = 'rgba(200, 230, 76, 0.10)';

const ANCHO_ITEM = 260;
const ANCHO_INCID = 82; // columna angosta de incidencia, fija junto a la de ítems
const ANCHO_MES = 92;
const ANCHO_TOTAL = 104;

// Explosión de insumos: columna de nombre (izq) y columna de total+plata (der).
const ANCHO_INSUMO = 250;
const ANCHO_UNIDAD = 76; // columna angosta de unidad de medida, fija junto a la de insumo
const ANCHO_TOTAL_PLATA = 176;
// Los meses de la explosión son más anchos que los del cronograma: además de la
// cantidad base pueden llevar debajo la cantidad en unidad de compra.
const ANCHO_MES_EXPLOSION = 106;

// left de la columna de unidad = justo después de la de insumo, para que queden
// pegadas al fijarse en el scroll horizontal (mismo criterio que LEFT_INCID).
const LEFT_UNIDAD = ANCHO_INSUMO;

// left de la columna de incidencia = justo después de la de ítems (deben coincidir
// con el ancho renderizado de la columna de ítems para que queden pegadas al fijar).
const LEFT_INCID = ANCHO_ITEM;

/* ─── Helpers ──────────────────────────────────────────────────────────────── */

function formatPrecio(v: number) {
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(v);
}

function formatNum(v: number) {
  return new Intl.NumberFormat('es-AR', { maximumFractionDigits: 2 }).format(v);
}

/* Porcentaje con un decimal (ej: "56,4%"). */
function formatPct1(v: number) {
  return (
    new Intl.NumberFormat('es-AR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(v) + '%'
  );
}

/* Insumos que se cuentan por unidad entera (ej: ladrillos, unidad "u"): se
 * muestran redondeados a entero. El resto, hasta 2 decimales. */
function esUnidadEntera(unidad: string): boolean {
  return unidad.trim().toLowerCase() === 'u';
}

function formatCantidad(v: number, unidad: string): string {
  if (esUnidadEntera(unidad)) {
    return new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 }).format(Math.round(v));
  }
  return new Intl.NumberFormat('es-AR', { maximumFractionDigits: 2 }).format(v);
}

/* Cantidad en unidad de compra: siempre entera (viene redondeada hacia arriba)
 * y con la unidad pluralizada de forma simple. La unidad_compra es texto libre
 * ("bolsa", "barra", "rollo"), así que alcanza con agregar la "s". */
function formatCompra(unidades: number, unidadCompra: string): string {
  const n = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 }).format(unidades);
  const plural =
    unidades === 1 || unidadCompra.endsWith('s') ? unidadCompra : `${unidadCompra}s`;
  return `${n} ${plural}`;
}

type Estado = 'guardando' | 'guardado' | 'error';
type Modo = 'relativo' | 'calendario';

const claveCelda = (itemId: string, mes: number) => `${itemId}::${mes}`;

const MESES_ABBR = [
  'Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic',
];

/* Etiqueta calendario del mes relativo N = fecha_inicio + (N-1) meses. Solo es una
 * etiqueta de presentación: el índice guardado en la BD sigue siendo N (relativo). */
function etiquetaMesCalendario(fechaInicio: string, mes: number): string {
  const base = fechaInicio.slice(0, 10);
  const [y, m] = base.split('-').map(Number);
  if (!y || !m) return `Mes ${mes}`;
  const d = new Date(y, m - 1 + (mes - 1), 1);
  return `${MESES_ABBR[d.getMonth()]} ${d.getFullYear()}`;
}

function pctDesdeTexto(texto: string): number {
  const limpio = texto.trim();
  if (limpio === '') return 0;
  const n = Number(limpio);
  return Number.isFinite(n) ? n : 0;
}

/* Color del total de fila según qué tan cerca está del 100% (validación blanda). */
function colorTotalFila(pct: number): string {
  if (Math.abs(pct - 100) < 0.005) return '#22C55E'; // llega justo
  if (pct > 100) return '#EF4444'; // se pasó
  return '#F59E0B'; // le falta
}

/* Semilla del estado local a partir de la respuesta del servidor. */
function semillaDesdeDatos(datos: PlanificacionResponse): {
  valores: Record<string, string>;
  guardados: Record<string, number>;
} {
  const valores: Record<string, string> = {};
  const guardados: Record<string, number> = {};
  for (const rubro of datos.rubros) {
    for (const item of rubro.items) {
      for (const p of item.planificacion) {
        const k = claveCelda(item.item_id, p.mes);
        const pct = Number(p.pct_plan);
        if (pct > 0) valores[k] = String(pct);
        guardados[k] = pct;
      }
    }
  }
  return { valores, guardados };
}

/* Mes más alto (relativo) con avance cargado en el servidor. Sirve para avisar
 * antes de recortar el plazo por debajo de datos ya guardados. */
function maxMesConDatos(datos: PlanificacionResponse): number {
  let max = 0;
  for (const rubro of datos.rubros) {
    for (const item of rubro.items) {
      for (const p of item.planificacion) {
        if (Number(p.pct_plan) > 0 && p.mes > max) max = p.mes;
      }
    }
  }
  return max;
}

/* ─── Toggle de modo de encabezado (Relativo / Calendario) ─────────────────── */
/* Reutilizado por el Cronograma (dentro de ConfigBar) y por la Explosión de
 * insumos, para no duplicar la lógica de encabezados. */

function ToggleModo({
  modo,
  setModo,
  hayFecha,
}: {
  modo: Modo;
  setModo: (m: Modo) => void;
  hayFecha: boolean;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: '#9CA3AF' }}>
        Encabezados
      </span>
      <div
        className="flex rounded-[10px] p-0.5"
        style={{ border: '1px solid rgba(0,0,0,0.12)', background: 'rgba(255,255,255,0.5)' }}
      >
        {(['relativo', 'calendario'] as const).map((m) => {
          const activo = modo === m;
          const deshabilitado = m === 'calendario' && !hayFecha;
          return (
            <button
              key={m}
              type="button"
              disabled={deshabilitado}
              onClick={() => setModo(m)}
              title={deshabilitado ? 'Cargá una fecha de inicio para usar el modo calendario' : undefined}
              className="text-xs font-semibold px-3 py-1.5 rounded-[8px] transition-colors disabled:cursor-not-allowed"
              style={{
                background: activo ? '#C8E64C' : 'transparent',
                color: deshabilitado ? '#C4C4CC' : activo ? '#2A3300' : '#6B7080',
              }}
            >
              {m === 'relativo' ? 'Relativo' : 'Calendario'}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ─── Barra de configuración (fecha de inicio + plazo + modo de encabezado) ──── */

function ConfigBar({
  fechaInicioServer,
  plazoServer,
  topeConDatos,
  modo,
  setModo,
  totalCostoCosto,
  guardarConfiguracion,
  onError,
}: {
  fechaInicioServer: string;
  plazoServer: number;
  topeConDatos: number;
  modo: Modo;
  setModo: (m: Modo) => void;
  totalCostoCosto: number;
  guardarConfiguracion: (plazo: number | null, fecha: string) => Promise<void>;
  onError: (msg: string | null) => void;
}) {
  const fechaBase = fechaInicioServer ? fechaInicioServer.slice(0, 10) : '';
  const [fecha, setFecha] = useState(fechaBase);
  const [plazoTexto, setPlazoTexto] = useState(plazoServer > 0 ? String(plazoServer) : '');
  const [guardando, setGuardando] = useState(false);
  const [confirmPlazo, setConfirmPlazo] = useState<number | null>(null);

  // Resincronizar cuando el servidor devuelve valores nuevos (tras persistir).
  useEffect(() => {
    setFecha(fechaInicioServer ? fechaInicioServer.slice(0, 10) : '');
  }, [fechaInicioServer]);
  useEffect(() => {
    setPlazoTexto(plazoServer > 0 ? String(plazoServer) : '');
  }, [plazoServer]);

  const persistir = useCallback(
    async (plazo: number, nuevaFecha: string) => {
      setGuardando(true);
      onError(null);
      try {
        await guardarConfiguracion(plazo, nuevaFecha);
      } catch (e) {
        onError(e instanceof Error ? e.message : 'No se pudo guardar la configuración de la obra');
      } finally {
        setGuardando(false);
      }
    },
    [guardarConfiguracion, onError],
  );

  // Cambio de fecha: reetiqueta, no toca los porcentajes ni el plazo guardado.
  const cambiarFecha = useCallback(
    (nueva: string) => {
      setFecha(nueva);
      if (!nueva && modo === 'calendario') setModo('relativo');
      void persistir(plazoServer, nueva);
    },
    [modo, plazoServer, persistir, setModo],
  );

  // Aplica un plazo nuevo; si recorta por debajo de datos guardados, primero avisa.
  const aplicarPlazo = useCallback(
    (nuevo: number) => {
      if (!Number.isFinite(nuevo) || nuevo < 1) {
        setPlazoTexto(plazoServer > 0 ? String(plazoServer) : '');
        return;
      }
      if (nuevo === plazoServer) {
        setPlazoTexto(String(nuevo));
        return;
      }
      if (nuevo < topeConDatos) {
        setConfirmPlazo(nuevo); // hay avance en meses que quedarían fuera → confirmar
        return;
      }
      void persistir(nuevo, fecha);
    },
    [plazoServer, topeConDatos, fecha, persistir],
  );

  const incBase = plazoServer > 0 ? plazoServer : 0;
  const labelCls = 'text-[11px] font-semibold uppercase tracking-wide';
  const stepBtn: React.CSSProperties = {
    width: 30,
    height: 34,
    borderRadius: 8,
    border: '1px solid rgba(0,0,0,0.12)',
    background: 'rgba(255,255,255,0.6)',
    color: '#1A1A2E',
    fontSize: 16,
    lineHeight: '1',
    fontWeight: 600,
  };

  return (
    <div style={GLASS_CARD} className="px-5 py-3 flex flex-wrap items-end gap-x-7 gap-y-3">
      {/* Fecha de inicio */}
      <div className="flex flex-col gap-1">
        <span className={labelCls} style={{ color: '#9CA3AF' }}>
          Fecha de inicio
        </span>
        <input
          type="date"
          value={fecha}
          onChange={(e) => cambiarFecha(e.target.value)}
          className="text-sm rounded-[10px] px-3 py-2 focus:outline-none"
          style={{
            border: '1px solid rgba(0,0,0,0.12)',
            background: 'rgba(255,255,255,0.6)',
            color: '#1A1A2E',
            minWidth: 150,
          }}
        />
      </div>

      {/* Plazo en meses con stepper */}
      <div className="flex flex-col gap-1">
        <span className={labelCls} style={{ color: '#9CA3AF' }}>
          Plazo (meses)
        </span>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => aplicarPlazo((plazoServer > 0 ? plazoServer : 1) - 1)}
            disabled={plazoServer <= 1}
            style={{ ...stepBtn, opacity: plazoServer <= 1 ? 0.4 : 1 }}
            className="hover:bg-black/[0.04] transition-colors disabled:cursor-not-allowed"
            aria-label="Quitar un mes"
          >
            −
          </button>
          <input
            type="number"
            min="1"
            value={plazoTexto}
            onChange={(e) => setPlazoTexto(e.target.value)}
            onBlur={() => aplicarPlazo(parseInt(plazoTexto, 10))}
            onKeyDown={(e) => {
              if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
            }}
            placeholder="1"
            className="text-sm text-center font-mono tabular-nums rounded-[10px] px-2 py-2 focus:outline-none"
            style={{
              border: '1px solid rgba(0,0,0,0.12)',
              background: 'rgba(255,255,255,0.6)',
              color: '#1A1A2E',
              width: 64,
            }}
          />
          <button
            type="button"
            onClick={() => aplicarPlazo(incBase + 1)}
            style={stepBtn}
            className="hover:bg-black/[0.04] transition-colors"
            aria-label="Agregar un mes"
          >
            +
          </button>
        </div>
      </div>

      {/* Modo de encabezado (compartido con la vista de explosión) */}
      <ToggleModo modo={modo} setModo={setModo} hayFecha={!!fecha} />

      <div className="flex-1" />

      {guardando && (
        <span className="text-xs pb-2" style={{ color: '#6B7080' }}>
          Guardando…
        </span>
      )}

      {/* Total costo-costo (referencia) */}
      <div className="flex flex-col gap-1 items-end pb-0.5">
        <span className={labelCls} style={{ color: '#9CA3AF' }}>
          Total costo-costo
        </span>
        <span className="text-base font-bold font-mono tabular-nums" style={{ color: '#1A1A2E' }}>
          {formatPrecio(totalCostoCosto)}
        </span>
      </div>

      {/* Modal de confirmación al recortar el plazo por debajo de datos cargados */}
      {confirmPlazo !== null && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(20,18,25,0.35)' }}
        >
          <div style={{ ...GLASS_CARD, maxWidth: 440 }} className="p-6">
            <h3 className="text-base font-bold mb-2" style={{ color: '#1A1A2E' }}>
              Reducir el plazo a {confirmPlazo} {confirmPlazo === 1 ? 'mes' : 'meses'}
            </h3>
            <p className="text-sm mb-4" style={{ color: '#6B7080' }}>
              Hay avance cargado hasta el <span className="font-semibold">mes {topeConDatos}</span>. Los
              porcentajes de los meses {confirmPlazo + 1} a {topeConDatos} van a quedar{' '}
              <span className="font-semibold">ocultos</span>. No se borran: siguen guardados y vuelven a
              aparecer si volvés a ampliar el plazo.
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setConfirmPlazo(null);
                  setPlazoTexto(plazoServer > 0 ? String(plazoServer) : '');
                }}
                className="px-4 py-2 rounded-full text-sm font-medium transition-colors hover:bg-black/[0.04]"
                style={{ border: '1.5px solid #1A1A2E', color: '#1A1A2E' }}
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => {
                  const p = confirmPlazo;
                  setConfirmPlazo(null);
                  void persistir(p, fecha);
                }}
                className="px-4 py-2 rounded-full text-sm font-semibold transition-colors"
                style={{ background: '#C8E64C', color: '#2A3300' }}
              >
                Ocultar y reducir
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Celda editable ───────────────────────────────────────────────────────── */

function Celda({
  valor,
  estado,
  onChange,
  onCommit,
  onFocus,
  onBlur,
}: {
  valor: string;
  estado: Estado | undefined;
  onChange: (v: string) => void;
  onCommit: () => void;
  onFocus: () => void;
  onBlur: () => void;
}) {
  const ring =
    estado === 'error'
      ? '0 0 0 2px rgba(239, 68, 68, 0.55)'
      : estado === 'guardado'
      ? '0 0 0 2px rgba(34, 197, 94, 0.45)'
      : undefined;

  const puntoColor =
    estado === 'guardando'
      ? '#F59E0B'
      : estado === 'guardado'
      ? '#22C55E'
      : estado === 'error'
      ? '#EF4444'
      : undefined;

  return (
    <div className="relative w-full">
      <input
        type="number"
        min="0"
        max="100"
        step="1"
        inputMode="decimal"
        value={valor}
        onChange={(e) => onChange(e.target.value)}
        onFocus={onFocus}
        onBlur={() => {
          onBlur();
          onCommit();
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        }}
        className="w-full text-right font-mono tabular-nums text-sm rounded-[6px] px-1.5 py-1 bg-transparent border border-transparent focus:outline-none focus:border-[#C8E64C] transition-shadow"
        style={{ color: '#1A1A2E', boxShadow: ring }}
        aria-invalid={estado === 'error'}
        title={estado === 'error' ? 'No se pudo guardar — revisá el valor (0 a 100) y reintentá' : undefined}
      />
      {puntoColor && (
        <span
          className="absolute top-1 left-1 rounded-full"
          style={{
            width: '6px',
            height: '6px',
            background: puntoColor,
            boxShadow: estado === 'guardando' ? '0 0 0 2px rgba(245,158,11,0.25)' : undefined,
          }}
        />
      )}
    </div>
  );
}

/* ─── Curva de inversión acumulada (SVG inline, sin dependencias) ───────────── */

function CurvaAcumulada({
  montoPorMes,
  etiquetas,
  total,
}: {
  montoPorMes: number[];
  etiquetas: string[];
  total: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [ancho, setAncho] = useState(760);

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

  // Acumulado: cada mes = su plata + la de todos los meses anteriores.
  const acumulado = useMemo(() => {
    const out: number[] = [];
    let s = 0;
    for (const m of montoPorMes) {
      s += m;
      out.push(s);
    }
    return out;
  }, [montoPorMes]);

  const n = acumulado.length;
  const H = 220;
  const padL = 14;
  const padR = 16;
  const padT = 20;
  const padB = 30;
  const plotW = Math.max(ancho - padL - padR, 10);
  const plotH = H - padT - padB;
  const ultimo = acumulado[n - 1] ?? 0;
  const maxY = Math.max(total, ultimo, 1);

  const x = (i: number) => padL + (n <= 1 ? plotW / 2 : (i / (n - 1)) * plotW);
  const y = (v: number) => padT + plotH - (v / maxY) * plotH;
  const baseY = padT + plotH;

  const puntos = acumulado.map((v, i) => ({ cx: x(i), cy: y(v), v, i }));
  const linea = puntos
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.cx.toFixed(1)} ${p.cy.toFixed(1)}`)
    .join(' ');
  const area =
    n > 0
      ? `M ${x(0).toFixed(1)} ${baseY.toFixed(1)} ` +
        puntos.map((p) => `L ${p.cx.toFixed(1)} ${p.cy.toFixed(1)}`).join(' ') +
        ` L ${x(n - 1).toFixed(1)} ${baseY.toFixed(1)} Z`
      : '';
  const yTotal = y(total);
  // Para no saturar el eje, mostramos como mucho ~12 etiquetas.
  const pasoEtiqueta = Math.ceil(n / 12) || 1;

  return (
    <div style={GLASS_CARD} className="p-5">
      <div className="flex items-baseline justify-between mb-3">
        <h3 className="text-sm font-semibold" style={{ color: '#1A1A2E' }}>
          Curva de inversión acumulada
        </h3>
        <span className="text-xs" style={{ color: '#6B7080' }}>
          Costo-costo · acumulado mes a mes
        </span>
      </div>
      <div ref={ref} style={{ width: '100%' }}>
        <svg width={ancho} height={H} role="img" aria-label="Curva de inversión acumulada por mes">
          <defs>
            <linearGradient id="grad-curva" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="rgba(200,230,76,0.35)" />
              <stop offset="100%" stopColor="rgba(200,230,76,0.02)" />
            </linearGradient>
          </defs>

          {/* Línea base */}
          <line x1={padL} y1={baseY} x2={padL + plotW} y2={baseY} stroke="rgba(0,0,0,0.10)" />

          {/* Objetivo: total costo-costo (donde debería terminar la curva) */}
          {total > 0 && (
            <>
              <line
                x1={padL}
                y1={yTotal}
                x2={padL + plotW}
                y2={yTotal}
                stroke="rgba(26,26,46,0.18)"
                strokeDasharray="4 4"
              />
              <text x={padL + plotW} y={yTotal - 5} textAnchor="end" fontSize="10" fill="#6B7080">
                Total {formatPrecio(total)}
              </text>
            </>
          )}

          {area && <path d={area} fill="url(#grad-curva)" />}
          {linea && (
            <path
              d={linea}
              fill="none"
              stroke="#2A3300"
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          )}

          {puntos.map((p) => (
            <circle key={p.i} cx={p.cx} cy={p.cy} r={3} fill="#2A3300">
              <title>{`${etiquetas[p.i]}: ${formatPrecio(p.v)}`}</title>
            </circle>
          ))}

          {puntos.map((p) =>
            p.i % pasoEtiqueta === 0 || p.i === n - 1 ? (
              <text
                key={`lbl-${p.i}`}
                x={p.cx}
                y={H - 10}
                textAnchor="middle"
                fontSize="10"
                fill="#9CA3AF"
              >
                {etiquetas[p.i]}
              </text>
            ) : null,
          )}
        </svg>
      </div>
    </div>
  );
}

/* ─── Grilla ───────────────────────────────────────────────────────────────── */

function Grilla({
  datos,
  guardarCelda,
  modo,
}: {
  datos: PlanificacionResponse;
  guardarCelda: (itemId: string, mes: number, pct: number | null) => Promise<void>;
  modo: Modo;
}) {
  const meses = datos.plazo_meses && datos.plazo_meses > 0 ? datos.plazo_meses : 0;

  const [valores, setValores] = useState<Record<string, string>>({});
  const [estados, setEstados] = useState<Record<string, Estado>>({});
  const [colapsados, setColapsados] = useState<Record<string, boolean>>({});

  // Refs para proteger, al re-sembrar tras un guardado, los borradores que el
  // usuario todavía está tocando o los que quedaron en error.
  const guardadosRef = useRef<Record<string, number>>({});
  const estadosRef = useRef<Record<string, Estado>>({});
  const focoRef = useRef<string | null>(null);
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  estadosRef.current = estados;

  // (Re)sembrar desde el servidor. Corre en la carga inicial y tras cada
  // refetch que dispara guardarCelda. Preserva la celda con foco y las que
  // están en error para no pisar lo que el usuario está editando.
  useEffect(() => {
    const { valores: v, guardados: g } = semillaDesdeDatos(datos);
    guardadosRef.current = g;
    setValores((prev) => {
      const siguiente = { ...v };
      const foco = focoRef.current;
      if (foco && prev[foco] !== undefined) siguiente[foco] = prev[foco];
      for (const [k, est] of Object.entries(estadosRef.current)) {
        if (est === 'error' && prev[k] !== undefined) siguiente[k] = prev[k];
      }
      return siguiente;
    });
  }, [datos]);

  useEffect(() => {
    const pendientes = timers.current;
    return () => {
      Object.values(pendientes).forEach(clearTimeout);
    };
  }, []);

  const marcarEstado = useCallback((k: string, est: Estado | null) => {
    setEstados((prev) => {
      if (est === null) {
        if (prev[k] === undefined) return prev;
        const copia = { ...prev };
        delete copia[k];
        return copia;
      }
      return { ...prev, [k]: est };
    });
  }, []);

  const commit = useCallback(
    async (itemId: string, mes: number) => {
      const k = claveCelda(itemId, mes);
      const pct = pctDesdeTexto(valores[k] ?? '');
      const persistido = guardadosRef.current[k] ?? 0;

      // Valor fuera de rango: marca de error localizada, sin pegarle al server.
      if (pct < 0 || pct > 100) {
        marcarEstado(k, 'error');
        return;
      }

      // Sin cambios reales: normaliza el texto y limpia cualquier error viejo.
      if (pct === persistido) {
        setValores((prev) => ({ ...prev, [k]: pct === 0 ? '' : String(pct) }));
        marcarEstado(k, null);
        return;
      }

      marcarEstado(k, 'guardando');
      try {
        await guardarCelda(itemId, mes, pct);
        guardadosRef.current[k] = pct;
        setValores((prev) => ({ ...prev, [k]: pct === 0 ? '' : String(pct) }));
        marcarEstado(k, 'guardado');
        clearTimeout(timers.current[k]);
        timers.current[k] = setTimeout(() => marcarEstado(k, null), 1300);
      } catch {
        marcarEstado(k, 'error');
      }
    },
    [valores, guardarCelda, marcarEstado],
  );

  const setValor = useCallback((k: string, v: string) => {
    setValores((prev) => ({ ...prev, [k]: v }));
  }, []);

  // Subtotales por ítem (para traducir % a plata).
  const subtotalItem = useMemo(() => {
    const mapa: Record<string, number> = {};
    for (const rubro of datos.rubros) {
      for (const item of rubro.items) mapa[item.item_id] = item.subtotal_costo_costo;
    }
    return mapa;
  }, [datos]);

  // Incidencia acumulada por rubro = suma de incidencia_pct de sus ítems.
  const incidenciaRubro = useMemo(() => {
    const mapa: Record<string, number> = {};
    for (const rubro of datos.rubros) {
      mapa[rubro.rubro_id] = rubro.items.reduce((a, it) => a + it.incidencia_pct, 0);
    }
    return mapa;
  }, [datos]);

  // Incidencia total (referencia en el pie; debería dar ~100%).
  const incidenciaTotal = useMemo(
    () => datos.rubros.reduce((a, r) => a + (incidenciaRubro[r.rubro_id] ?? 0), 0),
    [datos, incidenciaRubro],
  );

  // Cálculos en vivo: plata por celda = (pct/100) × subtotal del ítem.
  const calc = useMemo(() => {
    const montoPorMes = new Array<number>(meses).fill(0);
    const totalFilaPct: Record<string, number> = {};
    const rubroMontoPorMes: Record<string, number[]> = {};
    let granTotal = 0;

    for (const rubro of datos.rubros) {
      const acumRubro = new Array<number>(meses).fill(0);
      for (const item of rubro.items) {
        const sub = subtotalItem[item.item_id] ?? 0;
        let sumaPct = 0;
        for (let mes = 1; mes <= meses; mes++) {
          const pct = pctDesdeTexto(valores[claveCelda(item.item_id, mes)] ?? '');
          sumaPct += pct;
          const plata = (pct / 100) * sub;
          montoPorMes[mes - 1] += plata;
          acumRubro[mes - 1] += plata;
          granTotal += plata;
        }
        totalFilaPct[item.item_id] = sumaPct;
      }
      rubroMontoPorMes[rubro.rubro_id] = acumRubro;
    }

    return { montoPorMes, totalFilaPct, rubroMontoPorMes, granTotal };
  }, [datos, valores, meses, subtotalItem]);

  if (meses === 0) {
    return (
      <div style={GLASS_CARD} className="p-6">
        <p className="text-sm font-medium" style={{ color: '#1A1A2E' }}>
          Esta obra todavía no tiene un plazo definido.
        </p>
        <p className="text-sm mt-2" style={{ color: '#6B7080' }}>
          Definí el <span className="font-medium">plazo (meses)</span> en la barra de arriba para empezar a
          planificar por mes.
        </p>
      </div>
    );
  }

  const hayItems = datos.rubros.some((r) => r.items.length > 0);
  if (!hayItems) {
    return (
      <div style={GLASS_CARD} className="p-6">
        <p className="text-sm" style={{ color: '#6B7080' }}>
          Esta obra no tiene ítems con receta para planificar. Cargá el cómputo primero.
        </p>
      </div>
    );
  }

  const columnas = Array.from({ length: meses }, (_, i) => i + 1);
  const modoEfectivo: Modo = modo === 'calendario' && datos.fecha_inicio ? 'calendario' : 'relativo';
  const etiquetas = columnas.map((mes) =>
    modoEfectivo === 'calendario' ? etiquetaMesCalendario(datos.fecha_inicio, mes) : `Mes ${mes}`,
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="overflow-auto" style={{ ...GLASS_CARD, maxHeight: 'calc(100vh - 360px)' }}>
        <table className="border-collapse" style={{ minWidth: '100%' }}>
          <thead>
            <tr>
              <th
                className="text-left px-4 py-3"
                style={{
                  position: 'sticky',
                  top: 0,
                  left: 0,
                  zIndex: 30,
                  width: ANCHO_ITEM,
                  minWidth: ANCHO_ITEM,
                  background: BG_CORNER,
                  backdropFilter: 'blur(8px)',
                  fontSize: '13px',
                  fontWeight: 600,
                  color: '#6B7080',
                  borderBottom: '1px solid rgba(0,0,0,0.08)',
                }}
              >
                Ítem
              </th>
              {/* Incidencia: columna angosta, fija junto a la de ítems */}
              <th
                className="px-2 py-3 text-right"
                style={{
                  position: 'sticky',
                  top: 0,
                  left: LEFT_INCID,
                  zIndex: 30,
                  width: ANCHO_INCID,
                  minWidth: ANCHO_INCID,
                  background: BG_CORNER,
                  backdropFilter: 'blur(8px)',
                  fontSize: '13px',
                  fontWeight: 600,
                  color: '#6B7080',
                  borderBottom: '1px solid rgba(0,0,0,0.08)',
                  borderRight: '1px solid rgba(0,0,0,0.06)',
                }}
                title="Incidencia sobre el total costo-costo"
              >
                Incid.
              </th>
              {columnas.map((mes) => (
                <th
                  key={mes}
                  className="px-2 py-3 text-center"
                  style={{
                    position: 'sticky',
                    top: 0,
                    zIndex: 20,
                    width: ANCHO_MES,
                    minWidth: ANCHO_MES,
                    background: BG_HEADER,
                    backdropFilter: 'blur(8px)',
                    fontSize: '13px',
                    fontWeight: 600,
                    color: '#6B7080',
                    borderBottom: '1px solid rgba(0,0,0,0.08)',
                  }}
                >
                  <div>{etiquetas[mes - 1]}</div>
                  {modoEfectivo === 'calendario' && (
                    <div style={{ fontSize: '10px', fontWeight: 500, color: '#9CA3AF' }}>Mes {mes}</div>
                  )}
                </th>
              ))}
              <th
                className="px-3 py-3 text-center"
                style={{
                  position: 'sticky',
                  top: 0,
                  right: 0,
                  zIndex: 30,
                  width: ANCHO_TOTAL,
                  minWidth: ANCHO_TOTAL,
                  background: BG_CORNER,
                  backdropFilter: 'blur(8px)',
                  fontSize: '13px',
                  fontWeight: 600,
                  color: '#6B7080',
                  borderBottom: '1px solid rgba(0,0,0,0.08)',
                  borderLeft: '1px solid rgba(0,0,0,0.06)',
                }}
              >
                Total
              </th>
            </tr>
          </thead>

          <tbody>
            {datos.rubros.map((rubro) => {
              const colapsado = colapsados[rubro.rubro_id] ?? false;
              const montoRubro = calc.rubroMontoPorMes[rubro.rubro_id] ?? [];
              const totalRubro = montoRubro.reduce((a, b) => a + b, 0);
              const incidRubro = incidenciaRubro[rubro.rubro_id] ?? 0;

              return (
                <Fragment key={rubro.rubro_id}>
                  {/* Cabecera de rubro: toggle + incidencia acumulada + subtotales por mes */}
                  <tr style={{ background: BG_RUBRO }}>
                    <td
                      style={{
                        position: 'sticky',
                        left: 0,
                        zIndex: 10,
                        width: ANCHO_ITEM,
                        minWidth: ANCHO_ITEM,
                        background: BG_RUBRO_LEFT,
                        backdropFilter: 'blur(8px)',
                        borderBottom: '1px solid rgba(0,0,0,0.06)',
                      }}
                    >
                      <button
                        onClick={() =>
                          setColapsados((prev) => ({ ...prev, [rubro.rubro_id]: !colapsado }))
                        }
                        className="w-full flex items-center gap-2 px-4 py-2.5 text-left hover:opacity-80 transition-opacity"
                      >
                        <span
                          className="inline-block transition-transform"
                          style={{
                            color: '#6B7080',
                            fontSize: '11px',
                            transform: colapsado ? 'rotate(-90deg)' : 'rotate(0deg)',
                          }}
                        >
                          ▼
                        </span>
                        <span className="text-sm font-semibold truncate" style={{ color: '#1A1A2E' }}>
                          {rubro.rubro_nombre}
                        </span>
                      </button>
                    </td>
                    <td
                      className="px-2 py-2.5 text-right font-mono tabular-nums"
                      style={{
                        position: 'sticky',
                        left: LEFT_INCID,
                        zIndex: 10,
                        width: ANCHO_INCID,
                        minWidth: ANCHO_INCID,
                        background: BG_RUBRO_LEFT,
                        backdropFilter: 'blur(8px)',
                        borderBottom: '1px solid rgba(0,0,0,0.06)',
                        borderRight: '1px solid rgba(0,0,0,0.06)',
                        fontSize: '12px',
                        fontWeight: 600,
                        color: '#1A1A2E',
                      }}
                      title="Incidencia acumulada del rubro"
                    >
                      {formatPct1(incidRubro)}
                    </td>
                    {columnas.map((mes) => (
                      <td
                        key={mes}
                        className="px-2 py-2.5 text-right font-mono tabular-nums"
                        style={{
                          borderBottom: '1px solid rgba(0,0,0,0.06)',
                          fontSize: '11px',
                          color: '#6B7080',
                        }}
                      >
                        {montoRubro[mes - 1] > 0 ? formatPrecio(montoRubro[mes - 1]) : '—'}
                      </td>
                    ))}
                    <td
                      className="px-3 py-2.5 text-right font-mono tabular-nums"
                      style={{
                        position: 'sticky',
                        right: 0,
                        zIndex: 10,
                        width: ANCHO_TOTAL,
                        minWidth: ANCHO_TOTAL,
                        background: BG_RUBRO_LEFT,
                        backdropFilter: 'blur(8px)',
                        borderBottom: '1px solid rgba(0,0,0,0.06)',
                        borderLeft: '1px solid rgba(0,0,0,0.06)',
                        fontSize: '12px',
                        fontWeight: 600,
                        color: '#1A1A2E',
                      }}
                    >
                      {formatPrecio(totalRubro)}
                    </td>
                  </tr>

                  {/* Ítems del rubro (ocultos si está colapsado) */}
                  {!colapsado &&
                    rubro.items.map((item) => {
                      const totalPct = calc.totalFilaPct[item.item_id] ?? 0;
                      return (
                        <tr key={item.item_id} className="hover:bg-black/[0.015] transition-colors">
                          <td
                            style={{
                              position: 'sticky',
                              left: 0,
                              zIndex: 10,
                              width: ANCHO_ITEM,
                              minWidth: ANCHO_ITEM,
                              background: BG_STICKY_LEFT,
                              backdropFilter: 'blur(8px)',
                              borderBottom: '1px solid rgba(0,0,0,0.04)',
                            }}
                            className="px-4 py-2 pl-9"
                          >
                            <div className="text-sm truncate" style={{ color: '#1A1A2E' }}>
                              {item.descripcion}
                            </div>
                            <div className="text-xs" style={{ color: '#9CA3AF' }}>
                              {formatNum(item.cantidad_total)} {item.unidad_medida} ·{' '}
                              {formatPrecio(item.subtotal_costo_costo)}
                            </div>
                          </td>
                          {/* Incidencia del ítem (informativa, no editable) */}
                          <td
                            className="px-2 py-2 text-right font-mono tabular-nums"
                            style={{
                              position: 'sticky',
                              left: LEFT_INCID,
                              zIndex: 10,
                              width: ANCHO_INCID,
                              minWidth: ANCHO_INCID,
                              background: BG_STICKY_LEFT,
                              backdropFilter: 'blur(8px)',
                              borderBottom: '1px solid rgba(0,0,0,0.04)',
                              borderRight: '1px solid rgba(0,0,0,0.06)',
                              fontSize: '12px',
                              color: '#6B7080',
                            }}
                            title="Incidencia de este ítem sobre el total costo-costo"
                          >
                            {formatPct1(item.incidencia_pct)}
                          </td>
                          {columnas.map((mes) => {
                            const k = claveCelda(item.item_id, mes);
                            return (
                              <td
                                key={mes}
                                className="px-1 py-1"
                                style={{ borderBottom: '1px solid rgba(0,0,0,0.04)' }}
                              >
                                <Celda
                                  valor={valores[k] ?? ''}
                                  estado={estados[k]}
                                  onChange={(v) => setValor(k, v)}
                                  onCommit={() => commit(item.item_id, mes)}
                                  onFocus={() => {
                                    focoRef.current = k;
                                  }}
                                  onBlur={() => {
                                    if (focoRef.current === k) focoRef.current = null;
                                  }}
                                />
                              </td>
                            );
                          })}
                          <td
                            className="px-3 py-2 text-right font-mono tabular-nums"
                            style={{
                              position: 'sticky',
                              right: 0,
                              zIndex: 10,
                              width: ANCHO_TOTAL,
                              minWidth: ANCHO_TOTAL,
                              background: BG_STICKY_LEFT,
                              backdropFilter: 'blur(8px)',
                              borderBottom: '1px solid rgba(0,0,0,0.04)',
                              borderLeft: '1px solid rgba(0,0,0,0.06)',
                              fontSize: '13px',
                              fontWeight: 600,
                              color: colorTotalFila(totalPct),
                            }}
                            title={
                              Math.abs(totalPct - 100) < 0.005
                                ? 'Ítem completo (100%)'
                                : totalPct > 100
                                ? 'Se pasó del 100%'
                                : 'Todavía no llega al 100%'
                            }
                          >
                            {formatNum(totalPct)}%
                          </td>
                        </tr>
                      );
                    })}
                </Fragment>
              );
            })}
          </tbody>

          {/* Fila de totales por mes: lo más importante de la pantalla */}
          <tfoot>
            <tr>
              <td
                className="px-4 py-3"
                style={{
                  position: 'sticky',
                  left: 0,
                  bottom: 0,
                  zIndex: 30,
                  width: ANCHO_ITEM,
                  minWidth: ANCHO_ITEM,
                  background: BG_FOOTER,
                  backdropFilter: 'blur(8px)',
                  borderTop: '2px solid rgba(0,0,0,0.10)',
                  fontSize: '13px',
                  fontWeight: 700,
                  color: '#1A1A2E',
                }}
              >
                Plata por mes
              </td>
              <td
                className="px-2 py-3 text-right font-mono tabular-nums"
                style={{
                  position: 'sticky',
                  left: LEFT_INCID,
                  bottom: 0,
                  zIndex: 30,
                  width: ANCHO_INCID,
                  minWidth: ANCHO_INCID,
                  background: BG_FOOTER,
                  backdropFilter: 'blur(8px)',
                  borderTop: '2px solid rgba(0,0,0,0.10)',
                  borderRight: '1px solid rgba(0,0,0,0.06)',
                  fontSize: '12px',
                  fontWeight: 700,
                  color: '#1A1A2E',
                }}
                title="Incidencia total (debería dar ~100%)"
              >
                {formatPct1(incidenciaTotal)}
              </td>
              {columnas.map((mes) => (
                <td
                  key={mes}
                  className="px-2 py-3 text-right font-mono tabular-nums"
                  style={{
                    position: 'sticky',
                    bottom: 0,
                    zIndex: 20,
                    background: BG_FOOTER,
                    backdropFilter: 'blur(8px)',
                    borderTop: '2px solid rgba(0,0,0,0.10)',
                    fontSize: '12px',
                    fontWeight: 600,
                    color: '#1A1A2E',
                  }}
                >
                  {formatPrecio(calc.montoPorMes[mes - 1])}
                </td>
              ))}
              <td
                className="px-3 py-3 text-right font-mono tabular-nums"
                style={{
                  position: 'sticky',
                  right: 0,
                  bottom: 0,
                  zIndex: 30,
                  width: ANCHO_TOTAL,
                  minWidth: ANCHO_TOTAL,
                  background: BG_FOOTER,
                  backdropFilter: 'blur(8px)',
                  borderTop: '2px solid rgba(0,0,0,0.10)',
                  borderLeft: '1px solid rgba(0,0,0,0.06)',
                  fontSize: '12px',
                  fontWeight: 700,
                  color: '#1A1A2E',
                }}
              >
                {formatPrecio(calc.granTotal)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Curva de inversión acumulada, en vivo desde la plata por mes */}
      <CurvaAcumulada
        montoPorMes={calc.montoPorMes}
        etiquetas={etiquetas}
        total={datos.total_costo_costo}
      />
    </div>
  );
}

/* ─── Explosión de insumos (solo lectura) ──────────────────────────────────── */

type TipoInsumo = ExplosionInsumo['tipo'];

const TIPO_TABS: { id: TipoInsumo; label: string }[] = [
  { id: 'material', label: 'Materiales' },
  { id: 'mano_de_obra', label: 'Mano de obra' },
  { id: 'equipo', label: 'Equipo' },
];

// Texto para el mensaje de "sin insumos" de cada tipo.
const NOMBRE_TIPO: Record<TipoInsumo, string> = {
  material: 'materiales',
  mano_de_obra: 'mano de obra',
  equipo: 'equipo',
};

/* Editor del factor de compra de un insumo, embebido en la celda del insumo.
 *
 * Lo que se guarda acá es un OVERRIDE de esta obra: la referencia del insumo
 * (compartida con las demás obras) no se toca nunca. Vaciar el campo borra el
 * override y el insumo vuelve a la referencia. */
function EditorFactor({
  insumo,
  onGuardar,
}: {
  insumo: ExplosionInsumo;
  onGuardar: (insumoId: string, factor: number | null) => Promise<void>;
}) {
  const factorServer = insumo.factor_compra;
  const [texto, setTexto] = useState(factorServer !== null ? String(factorServer) : '');
  const [estado, setEstado] = useState<Estado | undefined>(undefined);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Resincronizar cuando el servidor devuelve un factor nuevo (al guardar el
  // override o al borrarlo y volver a la referencia).
  useEffect(() => {
    setTexto(factorServer !== null ? String(factorServer) : '');
  }, [factorServer]);

  useEffect(() => () => clearTimeout(timer.current), []);

  const persistir = useCallback(
    async (valor: number | null) => {
      // Sin cambio real respecto de lo vigente: no se pega al servidor.
      if (valor === factorServer) {
        setEstado(undefined);
        setMensaje(null);
        return;
      }

      setEstado('guardando');
      setMensaje(null);
      try {
        await onGuardar(insumo.insumo_id, valor);
        setEstado('guardado');
        clearTimeout(timer.current);
        timer.current = setTimeout(() => setEstado(undefined), 1300);
      } catch (e) {
        setEstado('error');
        setMensaje(e instanceof Error ? e.message : 'No se pudo guardar el factor de compra');
      }
    },
    [factorServer, insumo.insumo_id, onGuardar],
  );

  const commit = useCallback(() => {
    const limpio = texto.trim().replace(',', '.');
    const valor = limpio === '' ? null : Number(limpio);

    if (valor !== null && (!Number.isFinite(valor) || valor <= 0)) {
      setEstado('error');
      setMensaje('El factor tiene que ser un número mayor a 0');
      return;
    }
    void persistir(valor);
  }, [texto, persistir]);

  const esOverride = insumo.factor_origen === 'obra';
  const ring =
    estado === 'error'
      ? '0 0 0 2px rgba(239, 68, 68, 0.55)'
      : estado === 'guardado'
      ? '0 0 0 2px rgba(34, 197, 94, 0.45)'
      : undefined;

  return (
    <div className="flex flex-col gap-0.5 mt-1">
      <div className="flex items-center gap-1.5">
        <span className="text-[11px]" style={{ color: '#9CA3AF' }}>
          ÷
        </span>
        <input
          type="number"
          min="0"
          step="any"
          inputMode="decimal"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          }}
          className="text-right font-mono tabular-nums text-[11px] rounded-[8px] px-1.5 py-0.5 focus:outline-none focus:border-[#C8E64C] transition-shadow"
          style={{
            width: 52,
            border: '1px solid rgba(0,0,0,0.12)',
            background: 'rgba(255,255,255,0.6)',
            color: '#1A1A2E',
            boxShadow: ring,
          }}
          aria-label={`Factor de compra de ${insumo.nombre}`}
          aria-invalid={estado === 'error'}
          title={`Cuántos ${insumo.unidad_medida} entran en 1 ${insumo.unidad_compra}. Se guarda solo para esta obra.`}
        />
        <span className="text-[11px] truncate" style={{ color: '#6B7080' }}>
          {insumo.unidad_medida}/{insumo.unidad_compra}
        </span>
        {estado === 'guardando' && (
          <span
            className="rounded-full shrink-0"
            style={{ width: 6, height: 6, background: '#F59E0B' }}
          />
        )}
        {esOverride && estado !== 'guardando' && (
          <button
            type="button"
            onClick={() => void persistir(null)}
            className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full shrink-0 transition-colors"
            style={{ background: 'rgba(200, 230, 76, 0.45)', color: '#2A3300' }}
            title={
              insumo.factor_referencia !== null
                ? `Valor propio de esta obra. Volver a la referencia (${insumo.factor_referencia} ${insumo.unidad_medida})`
                : 'Valor propio de esta obra. Quitar la conversión'
            }
          >
            obra ✕
          </button>
        )}
      </div>
      {estado === 'error' && mensaje && (
        <span className="text-[10px]" style={{ color: '#DC2626' }}>
          {mensaje}
        </span>
      )}
    </div>
  );
}

/* Tabla de un tipo de insumo: filas = insumos, columnas = meses. Solo lectura.
 * Columna de insumo fija a la izquierda, columna de total fija a la derecha,
 * encabezado de meses fijo arriba y fila de plata por mes fija abajo. */
function TablaExplosion({
  insumos,
  meses,
  etiquetas,
  modoEfectivo,
  guardarFactorCompra,
}: {
  insumos: ExplosionInsumo[];
  meses: number;
  etiquetas: string[];
  modoEfectivo: Modo;
  guardarFactorCompra: (insumoId: string, factor: number | null) => Promise<void>;
}) {
  const columnas = Array.from({ length: meses }, (_, i) => i + 1);

  // Plata por mes = suma sobre insumos de (cantidad del mes × precio). Gran total.
  const { plataPorMes, granTotalPlata } = useMemo(() => {
    const plataPorMes = new Array<number>(meses).fill(0);
    let granTotalPlata = 0;
    for (const ins of insumos) {
      for (let m = 0; m < meses; m++) {
        const plata = (ins.consumo_por_mes[m] ?? 0) * ins.precio_unitario;
        plataPorMes[m] += plata;
        granTotalPlata += plata;
      }
    }
    return { plataPorMes, granTotalPlata };
  }, [insumos, meses]);

  return (
    <div className="overflow-auto" style={{ ...GLASS_CARD, maxHeight: 'calc(100vh - 330px)' }}>
      <table className="border-collapse" style={{ minWidth: '100%' }}>
        <thead>
          <tr>
            <th
              className="text-left px-4 py-3"
              style={{
                position: 'sticky',
                top: 0,
                left: 0,
                zIndex: 30,
                width: ANCHO_INSUMO,
                minWidth: ANCHO_INSUMO,
                background: BG_CORNER,
                backdropFilter: 'blur(8px)',
                fontSize: '13px',
                fontWeight: 600,
                color: '#6B7080',
                borderBottom: '1px solid rgba(0,0,0,0.08)',
              }}
            >
              Insumo
            </th>
            {/* Unidad de medida: columna propia, fija junto a la de insumo */}
            <th
              className="text-left px-3 py-3"
              style={{
                position: 'sticky',
                top: 0,
                left: LEFT_UNIDAD,
                zIndex: 30,
                width: ANCHO_UNIDAD,
                minWidth: ANCHO_UNIDAD,
                background: BG_CORNER,
                backdropFilter: 'blur(8px)',
                fontSize: '13px',
                fontWeight: 600,
                color: '#6B7080',
                borderBottom: '1px solid rgba(0,0,0,0.08)',
                borderRight: '1px solid rgba(0,0,0,0.06)',
              }}
              title="Unidad de medida en la que se expresan las cantidades de la fila"
            >
              Unidad
            </th>
            {columnas.map((mes) => (
              <th
                key={mes}
                className="px-2 py-3 text-center"
                style={{
                  position: 'sticky',
                  top: 0,
                  zIndex: 20,
                  width: ANCHO_MES_EXPLOSION,
                  minWidth: ANCHO_MES_EXPLOSION,
                  background: BG_HEADER,
                  backdropFilter: 'blur(8px)',
                  fontSize: '13px',
                  fontWeight: 600,
                  color: '#6B7080',
                  borderBottom: '1px solid rgba(0,0,0,0.08)',
                }}
              >
                <div>{etiquetas[mes - 1]}</div>
                {modoEfectivo === 'calendario' && (
                  <div style={{ fontSize: '10px', fontWeight: 500, color: '#9CA3AF' }}>Mes {mes}</div>
                )}
              </th>
            ))}
            <th
              className="px-3 py-3 text-right"
              style={{
                position: 'sticky',
                top: 0,
                right: 0,
                zIndex: 30,
                width: ANCHO_TOTAL_PLATA,
                minWidth: ANCHO_TOTAL_PLATA,
                background: BG_CORNER,
                backdropFilter: 'blur(8px)',
                fontSize: '13px',
                fontWeight: 600,
                color: '#6B7080',
                borderBottom: '1px solid rgba(0,0,0,0.08)',
                borderLeft: '1px solid rgba(0,0,0,0.06)',
              }}
            >
              Total obra
            </th>
          </tr>
        </thead>

        <tbody>
          {insumos.map((ins) => {
            const plataTotal = ins.total * ins.precio_unitario;
            const compraTotal =
              ins.unidad_compra !== null
                ? convertirAUnidadCompra(ins.total, ins.factor_compra)
                : null;
            return (
              <tr key={ins.insumo_id} className="hover:bg-black/[0.015] transition-colors">
                <td
                  className="px-4 py-2"
                  style={{
                    position: 'sticky',
                    left: 0,
                    zIndex: 10,
                    width: ANCHO_INSUMO,
                    minWidth: ANCHO_INSUMO,
                    background: BG_STICKY_LEFT,
                    backdropFilter: 'blur(8px)',
                    borderBottom: '1px solid rgba(0,0,0,0.04)',
                  }}
                >
                  <div className="text-sm truncate" style={{ color: '#1A1A2E' }}>
                    {ins.nombre}
                  </div>
                  <div className="text-xs" style={{ color: '#9CA3AF' }}>
                    {formatPrecio(ins.precio_unitario)}/{ins.unidad_medida}
                  </div>
                  {/* Factor de compra: solo para insumos que tienen conversión
                    * definida (referencia u override). Los que no, se muestran
                    * igual que antes, solo en unidad base. */}
                  {ins.unidad_compra !== null && (
                    <EditorFactor insumo={ins} onGuardar={guardarFactorCompra} />
                  )}
                </td>
                {/* Unidad de medida del insumo: en qué está expresada la fila */}
                <td
                  className="px-3 py-2"
                  style={{
                    position: 'sticky',
                    left: LEFT_UNIDAD,
                    zIndex: 10,
                    width: ANCHO_UNIDAD,
                    minWidth: ANCHO_UNIDAD,
                    background: BG_STICKY_LEFT,
                    backdropFilter: 'blur(8px)',
                    borderBottom: '1px solid rgba(0,0,0,0.04)',
                    borderRight: '1px solid rgba(0,0,0,0.06)',
                    fontSize: '13px',
                    fontWeight: 500,
                    color: '#1A1A2E',
                  }}
                >
                  {ins.unidad_medida}
                </td>
                {columnas.map((mes) => {
                  const q = ins.consumo_por_mes[mes - 1] ?? 0;
                  // Cuánto comprar ese mes, en la unidad del proveedor.
                  const compraMes =
                    q > 0 && ins.unidad_compra !== null
                      ? convertirAUnidadCompra(q, ins.factor_compra)
                      : null;
                  return (
                    <td
                      key={mes}
                      className="px-2 py-2 text-right"
                      style={{
                        borderBottom: '1px solid rgba(0,0,0,0.04)',
                        color: q > 0 ? '#1A1A2E' : '#C4C4CC',
                      }}
                    >
                      <div className="font-mono tabular-nums" style={{ fontSize: '13px' }}>
                        {q > 0 ? formatCantidad(q, ins.unidad_medida) : '—'}
                      </div>
                      {compraMes !== null && ins.unidad_compra !== null && (
                        <div
                          className="font-mono tabular-nums truncate"
                          style={{ fontSize: '10px', color: '#6B7080' }}
                        >
                          {formatCompra(compraMes, ins.unidad_compra)}
                        </div>
                      )}
                    </td>
                  );
                })}
                <td
                  className="px-3 py-2 text-right"
                  style={{
                    position: 'sticky',
                    right: 0,
                    zIndex: 10,
                    width: ANCHO_TOTAL_PLATA,
                    minWidth: ANCHO_TOTAL_PLATA,
                    background: BG_STICKY_LEFT,
                    backdropFilter: 'blur(8px)',
                    borderBottom: '1px solid rgba(0,0,0,0.04)',
                    borderLeft: '1px solid rgba(0,0,0,0.06)',
                  }}
                >
                  <div className="font-mono tabular-nums" style={{ fontSize: '13px', fontWeight: 600, color: '#1A1A2E' }}>
                    {formatCantidad(ins.total, ins.unidad_medida)} {ins.unidad_medida}
                  </div>
                  {/* Cuánto comprar en toda la obra, en la unidad del proveedor.
                    * Es el dato que el usuario se lleva para pedir precio. */}
                  {compraTotal !== null && ins.unidad_compra !== null && (
                    <div
                      className="font-mono tabular-nums"
                      style={{ fontSize: '12px', fontWeight: 600, color: '#5C7C00' }}
                    >
                      {formatCompra(compraTotal, ins.unidad_compra)}
                    </div>
                  )}
                  <div className="font-mono tabular-nums" style={{ fontSize: '11px', color: '#6B7080' }}>
                    {formatPrecio(plataTotal)}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>

        {/* Fila de plata por mes: cuánta plata de este tipo de insumo se necesita cada mes */}
        <tfoot>
          <tr>
            <td
              className="px-4 py-3"
              style={{
                position: 'sticky',
                left: 0,
                bottom: 0,
                zIndex: 30,
                width: ANCHO_INSUMO,
                minWidth: ANCHO_INSUMO,
                background: BG_FOOTER,
                backdropFilter: 'blur(8px)',
                borderTop: '2px solid rgba(0,0,0,0.10)',
                fontSize: '13px',
                fontWeight: 700,
                color: '#1A1A2E',
              }}
            >
              Plata por mes
            </td>
            {/* Celda vacía bajo la columna de unidad, para no desalinear los meses */}
            <td
              style={{
                position: 'sticky',
                left: LEFT_UNIDAD,
                bottom: 0,
                zIndex: 30,
                width: ANCHO_UNIDAD,
                minWidth: ANCHO_UNIDAD,
                background: BG_FOOTER,
                backdropFilter: 'blur(8px)',
                borderTop: '2px solid rgba(0,0,0,0.10)',
                borderRight: '1px solid rgba(0,0,0,0.06)',
              }}
            />
            {columnas.map((mes) => (
              <td
                key={mes}
                className="px-2 py-3 text-right font-mono tabular-nums"
                style={{
                  position: 'sticky',
                  bottom: 0,
                  zIndex: 20,
                  background: BG_FOOTER,
                  backdropFilter: 'blur(8px)',
                  borderTop: '2px solid rgba(0,0,0,0.10)',
                  fontSize: '12px',
                  fontWeight: 600,
                  color: '#1A1A2E',
                }}
              >
                {formatPrecio(plataPorMes[mes - 1])}
              </td>
            ))}
            <td
              className="px-3 py-3 text-right font-mono tabular-nums"
              style={{
                position: 'sticky',
                right: 0,
                bottom: 0,
                zIndex: 30,
                width: ANCHO_TOTAL_PLATA,
                minWidth: ANCHO_TOTAL_PLATA,
                background: BG_FOOTER,
                backdropFilter: 'blur(8px)',
                borderTop: '2px solid rgba(0,0,0,0.10)',
                borderLeft: '1px solid rgba(0,0,0,0.06)',
                fontSize: '12px',
                fontWeight: 700,
                color: '#1A1A2E',
              }}
            >
              {formatPrecio(granTotalPlata)}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

function ExplosionInsumos({
  obraId,
  modo,
  setModo,
}: {
  obraId: string;
  modo: Modo;
  setModo: (m: Modo) => void;
}) {
  const { datos, cargando, error, guardarFactorCompra } = useExplosionInsumos(obraId);
  const [tipo, setTipo] = useState<TipoInsumo>('material');

  if (cargando) {
    return (
      <div className="flex items-center justify-center h-64">
        <p style={{ color: '#7A6A5A' }}>Cargando explosión de insumos…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div
        className="p-4 rounded-2xl"
        style={{ background: 'rgba(239, 68, 68, 0.12)', border: '1px solid rgba(239, 68, 68, 0.30)' }}
      >
        <p style={{ color: '#DC2626' }} className="text-sm font-medium">
          {error}
        </p>
      </div>
    );
  }

  if (!datos) return null;

  const meses = datos.plazo_meses && datos.plazo_meses > 0 ? datos.plazo_meses : 0;
  const modoEfectivo: Modo = modo === 'calendario' && datos.fecha_inicio ? 'calendario' : 'relativo';
  const columnas = Array.from({ length: meses }, (_, i) => i + 1);
  const etiquetas = columnas.map((mes) =>
    modoEfectivo === 'calendario' ? etiquetaMesCalendario(datos.fecha_inicio, mes) : `Mes ${mes}`,
  );

  const insumosDelTipo = datos.insumos.filter((i) => i.tipo === tipo);

  return (
    <div className="flex flex-col gap-4">
      {/* Tercer nivel de solapas: por tipo de insumo + toggle de encabezado */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex gap-6 px-1">
          {TIPO_TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTipo(t.id)}
              className="text-sm pb-2 transition-colors"
              style={{
                color: tipo === t.id ? '#1A1A2E' : '#6B7080',
                fontWeight: tipo === t.id ? 600 : 500,
                borderBottom: tipo === t.id ? '2px solid #1A1A2E' : '2px solid transparent',
              }}
            >
              {t.label}
            </button>
          ))}
        </div>
        {meses > 0 && <ToggleModo modo={modo} setModo={setModo} hayFecha={!!datos.fecha_inicio} />}
      </div>

      {meses === 0 ? (
        <div style={GLASS_CARD} className="p-6">
          <p className="text-sm font-medium" style={{ color: '#1A1A2E' }}>
            Esta obra todavía no tiene un plazo definido.
          </p>
          <p className="text-sm mt-2" style={{ color: '#6B7080' }}>
            Definí el <span className="font-medium">plazo</span> en la solapa{' '}
            <span className="font-medium">Cronograma</span> para ver la explosión de insumos por mes.
          </p>
        </div>
      ) : insumosDelTipo.length === 0 ? (
        <div style={GLASS_CARD} className="p-6">
          <p className="text-sm" style={{ color: '#6B7080' }}>
            No hay insumos de {NOMBRE_TIPO[tipo]} cargados en esta obra.
          </p>
        </div>
      ) : (
        <TablaExplosion
          insumos={insumosDelTipo}
          meses={meses}
          etiquetas={etiquetas}
          modoEfectivo={modoEfectivo}
          guardarFactorCompra={guardarFactorCompra}
        />
      )}
    </div>
  );
}

/* ─── Página ───────────────────────────────────────────────────────────────── */

// Sub-solapas internas de Planificación (mismo patrón que las de Presupuesto).
type SubTabId = 'cronograma' | 'explosion';

const SUBTABS: { id: SubTabId; label: string }[] = [
  { id: 'cronograma', label: 'Cronograma' },
  { id: 'explosion', label: 'Explosión de insumos' },
];

export default function PlanificacionPage() {
  const params = useParams();
  const obraId = params.id as string;
  const { datos, cargando, error, guardarCelda, guardarConfiguracion } = usePlanificacion(obraId);

  const [subtab, setSubtab] = useState<SubTabId>('cronograma');
  const [modo, setModo] = useState<Modo>('relativo');
  const [configError, setConfigError] = useState<string | null>(null);

  const obraNombre = datos?.obra_nombre ?? '…';
  const topeConDatos = useMemo(() => (datos ? maxMesConDatos(datos) : 0), [datos]);

  return (
    <div
      className="flex flex-col h-screen overflow-hidden"
      style={{ backgroundColor: '#D5D4DC', background: MESH_GRADIENT }}
    >
      {/* ── Header con tabs ── */}
      <header
        className="shrink-0 z-10 px-6 flex items-stretch gap-4"
        style={{
          height: '48px',
          background: 'rgba(255, 255, 255, 0.80)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          borderBottom: '1px solid rgba(255, 255, 255, 0.50)',
        }}
      >
        <span className="font-semibold text-sm truncate flex-1 flex items-center" style={{ color: '#1A1A2E' }}>
          {obraNombre}
        </span>
        <nav className="flex h-full">
          <Link
            href={`/obras/${obraId}/medicion`}
            className="px-5 flex items-center text-sm font-medium border-b-2 border-transparent transition-colors"
            style={{ color: '#6B7080' }}
          >
            Cómputo
          </Link>
          <Link
            href={`/obras/${obraId}/presupuesto`}
            className="px-5 flex items-center text-sm font-medium border-b-2 border-transparent transition-colors"
            style={{ color: '#6B7080' }}
          >
            Presupuesto
          </Link>
          <Link
            href={`/obras/${obraId}/planificacion`}
            className="px-5 flex items-center text-sm font-semibold border-b-2"
            style={{ borderColor: '#1A1A2E', color: '#1A1A2E' }}
          >
            Planificación
          </Link>
        </nav>
      </header>

      {/* ── Contenido ── */}
      <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-4">
        {cargando && (
          <div className="flex items-center justify-center h-64">
            <p style={{ color: '#7A6A5A' }}>Cargando planificación…</p>
          </div>
        )}

        {error && (
          <div
            className="p-4 rounded-2xl"
            style={{
              background: 'rgba(239, 68, 68, 0.12)',
              border: '1px solid rgba(239, 68, 68, 0.30)',
            }}
          >
            <p style={{ color: '#DC2626' }} className="text-sm font-medium">
              {error}
            </p>
          </div>
        )}

        {datos && !error && (
          <>
            {/* Sub-pestañas internas — mismo patrón visual que Presupuesto */}
            <div className="flex gap-6 px-1">
              {SUBTABS.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setSubtab(t.id)}
                  className="text-sm pb-2 transition-colors"
                  style={{
                    color: subtab === t.id ? '#1A1A2E' : '#6B7080',
                    fontWeight: subtab === t.id ? 600 : 500,
                    borderBottom: subtab === t.id ? '2px solid #1A1A2E' : '2px solid transparent',
                  }}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {/* Cronograma: todo lo que ya existía (grilla, incidencia, config, plata por mes, curva) */}
            {subtab === 'cronograma' && (
              <>
                {/* Barra de configuración: fecha de inicio + plazo + modo de encabezado */}
                <ConfigBar
                  fechaInicioServer={datos.fecha_inicio || ''}
                  plazoServer={datos.plazo_meses ?? 0}
                  topeConDatos={topeConDatos}
                  modo={modo}
                  setModo={setModo}
                  totalCostoCosto={datos.total_costo_costo}
                  guardarConfiguracion={guardarConfiguracion}
                  onError={setConfigError}
                />

                {configError && (
                  <div
                    className="p-3 rounded-2xl"
                    style={{
                      background: 'rgba(239, 68, 68, 0.12)',
                      border: '1px solid rgba(239, 68, 68, 0.30)',
                    }}
                  >
                    <p style={{ color: '#DC2626' }} className="text-sm font-medium">
                      {configError}
                    </p>
                  </div>
                )}

                <p className="text-xs px-1" style={{ color: '#9CA3AF' }}>
                  Cargá el % de avance físico de cada ítem por mes. Se guarda solo al salir de la celda. La
                  suma por fila debería llegar a 100%.
                </p>

                <Grilla datos={datos} guardarCelda={guardarCelda} modo={modo} />
              </>
            )}

            {/* Explosión de insumos: tabla por tipo, derivada del cronograma (solo lectura) */}
            {subtab === 'explosion' && (
              <ExplosionInsumos obraId={obraId} modo={modo} setModo={setModo} />
            )}
          </>
        )}
      </div>
    </div>
  );
}
