'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { ObraTabs } from '@/components/obras/ObraTabs';
import { usePlanificacion } from '@/hooks/usePlanificacion';
import { useCertificaciones } from '@/hooks/useCertificaciones';
import { useInsumos } from '@/hooks/useInsumos';
import type {
  CertificacionConDesvio,
  CertificacionDesvioInsumo,
  CertificacionInsumoPrevisto,
  Insumo,
  PlanificacionResponse,
} from '@/types';

type CertificacionesHook = ReturnType<typeof useCertificaciones>;

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

const INPUT: React.CSSProperties = {
  padding: '10px 14px',
  border: '1px solid rgba(0, 0, 0, 0.12)',
  borderRadius: '10px',
  fontSize: '14px',
  color: '#1A1A2E',
  background: 'rgba(255, 255, 255, 0.6)',
  backdropFilter: 'blur(8px)',
  outline: 'none',
};

const ACENTO = '#C8E64C';
const ACENTO_TEXTO = '#2A3300';
const TEXTO = '#1A1A2E';
const TEXTO_2 = '#6B7080';
const TEXTO_3 = '#9CA3AF';
const BORDE_SUTIL = '1px solid rgba(0, 0, 0, 0.06)';

/* ─── Helpers ──────────────────────────────────────────────────────────────── */

function formatNum(v: number, unidad: string): string {
  // Los insumos por unidad entera (ladrillos) no muestran decimales.
  const enteros = unidad.trim().toLowerCase() === 'u';
  return new Intl.NumberFormat('es-AR', {
    maximumFractionDigits: enteros ? 0 : 2,
  }).format(enteros ? Math.round(v) : v);
}

function hoyISO(): string {
  // Fecha local, no UTC: en Argentina toDateString UTC puede caer un día antes.
  const d = new Date();
  const mes = String(d.getMonth() + 1).padStart(2, '0');
  const dia = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mes}-${dia}`;
}

/** Acepta coma o punto como separador decimal; vacío devuelve null. */
function parsearCantidad(texto: string): number | null {
  const limpio = texto.trim().replace(',', '.');
  if (limpio === '') return null;
  const n = Number(limpio);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/* ─── Vista: Registrar ─────────────────────────────────────────────────────── */

function VistaRegistrar({
  datos,
  calcularPrevisto,
  crearCertificacion,
}: {
  datos: PlanificacionResponse;
  calcularPrevisto: CertificacionesHook['calcularPrevisto'];
  crearCertificacion: CertificacionesHook['crearCertificacion'];
}) {
  // Solo materiales: esta fase de certificación no carga mano de obra ni equipo.
  const { insumos: materiales } = useInsumos('material');

  const [fecha, setFecha] = useState(hoyISO());
  const [descripcion, setDescripcion] = useState('');
  const [tildados, setTildados] = useState<Set<string>>(new Set());

  const [previstos, setPrevistos] = useState<CertificacionInsumoPrevisto[]>([]);
  const [calculando, setCalculando] = useState(false);
  const [errorPrevisto, setErrorPrevisto] = useState<string | null>(null);

  // Cantidad real tipeada por insumo. Se guarda como texto para no pelear con
  // el cursor mientras se escribe; se parsea al guardar.
  const [reales, setReales] = useState<Record<string, string>>({});
  // Insumos que el encargado sumó a mano porque las recetas no los contemplaban.
  const [extras, setExtras] = useState<Insumo[]>([]);
  const [insumoAAgregar, setInsumoAAgregar] = useState('');

  const [guardando, setGuardando] = useState(false);
  const [errorGuardar, setErrorGuardar] = useState<string | null>(null);
  const [exito, setExito] = useState<string | null>(null);

  const itemIds = useMemo(() => Array.from(tildados), [tildados]);
  const claveSeleccion = useMemo(() => itemIds.slice().sort().join(','), [itemIds]);

  /* El previsto se recalcula cada vez que cambia la selección. La request
   * anterior se aborta para que dos clicks rápidos no dejen pisado el
   * resultado viejo sobre el nuevo. */
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    abortRef.current?.abort();

    if (itemIds.length === 0) {
      setPrevistos([]);
      setErrorPrevisto(null);
      setCalculando(false);
      return;
    }

    const controller = new AbortController();
    abortRef.current = controller;
    setCalculando(true);
    setErrorPrevisto(null);

    calcularPrevisto(
      itemIds.map((item_id) => ({ item_id })),
      controller.signal,
    )
      .then((res) => {
        if (controller.signal.aborted) return;
        // Solo materiales en pantalla; el backend manda los tres tipos.
        setPrevistos(res.insumos.filter((i) => i.tipo === 'material'));
      })
      .catch((err: Error) => {
        if (controller.signal.aborted || err.name === 'AbortError') return;
        setErrorPrevisto(err.message);
        setPrevistos([]);
      })
      .finally(() => {
        if (!controller.signal.aborted) setCalculando(false);
      });

    return () => controller.abort();
    // claveSeleccion es la identidad estable de itemIds (evita recalcular por
    // una referencia de array nueva con el mismo contenido).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [claveSeleccion, calcularPrevisto]);

  const alternarItem = useCallback((itemId: string) => {
    setTildados((prev) => {
      const siguiente = new Set(prev);
      if (siguiente.has(itemId)) siguiente.delete(itemId);
      else siguiente.add(itemId);
      return siguiente;
    });
    setExito(null);
  }, []);

  const alternarRubro = useCallback((itemsDelRubro: string[], todosTildados: boolean) => {
    setTildados((prev) => {
      const siguiente = new Set(prev);
      for (const id of itemsDelRubro) {
        if (todosTildados) siguiente.delete(id);
        else siguiente.add(id);
      }
      return siguiente;
    });
    setExito(null);
  }, []);

  /* Filas de material a mostrar: las previstas más las agregadas a mano que no
   * estén ya previstas (si el encargado agrega una que sí estaba, se funde con
   * la fila prevista en vez de duplicarse). */
  const filasMaterial = useMemo(() => {
    const idsPrevistos = new Set(previstos.map((p) => p.insumo_id));
    const filasExtra = extras
      .filter((e) => !idsPrevistos.has(e.id))
      .map((e) => ({
        insumo_id: e.id,
        nombre: e.nombre,
        unidad_medida: e.unidad_medida,
        cantidad_prevista: 0,
        esExtra: true,
      }));
    return [
      ...previstos.map((p) => ({
        insumo_id: p.insumo_id,
        nombre: p.nombre,
        unidad_medida: p.unidad_medida,
        cantidad_prevista: p.cantidad_prevista,
        esExtra: false,
      })),
      ...filasExtra,
    ];
  }, [previstos, extras]);

  const materialesDisponibles = useMemo(() => {
    const yaEnPantalla = new Set(filasMaterial.map((f) => f.insumo_id));
    return materiales.filter((m) => !yaEnPantalla.has(m.id));
  }, [materiales, filasMaterial]);

  const agregarExtra = useCallback(() => {
    const insumo = materiales.find((m) => m.id === insumoAAgregar);
    if (!insumo) return;
    setExtras((prev) => [...prev, insumo]);
    setInsumoAAgregar('');
  }, [materiales, insumoAAgregar]);

  const limpiar = useCallback(() => {
    setTildados(new Set());
    setReales({});
    setExtras([]);
    setDescripcion('');
    setPrevistos([]);
  }, []);

  const guardar = useCallback(async () => {
    setErrorGuardar(null);
    setExito(null);

    if (itemIds.length === 0) {
      setErrorGuardar('Tildá al menos un ítem ejecutado.');
      return;
    }

    // Un campo vacío significa "no se cargó", no "se consumió 0": se omite.
    // Un 0 escrito a propósito sí se manda, porque es un dato distinto.
    const insumos: Array<{ insumo_id: string; cantidad_real: number }> = [];
    for (const fila of filasMaterial) {
      const texto = reales[fila.insumo_id] ?? '';
      if (texto.trim() === '') continue;
      const cantidad = parsearCantidad(texto);
      if (cantidad === null) {
        setErrorGuardar(
          `La cantidad real de ${fila.nombre} no es un número válido mayor o igual a 0.`,
        );
        return;
      }
      insumos.push({ insumo_id: fila.insumo_id, cantidad_real: cantidad });
    }

    setGuardando(true);
    try {
      await crearCertificacion({
        fecha,
        descripcion: descripcion.trim() === '' ? null : descripcion.trim(),
        items: itemIds.map((item_id) => ({ item_id })),
        insumos,
      });
      limpiar();
      setExito('Certificación guardada. Podés verla en la solapa Histórico.');
    } catch (err) {
      setErrorGuardar((err as Error).message);
    } finally {
      setGuardando(false);
    }
  }, [itemIds, filasMaterial, reales, fecha, descripcion, crearCertificacion, limpiar]);

  return (
    <div className="flex flex-col gap-4">
      {/* ── Datos generales ── */}
      <section style={GLASS_CARD} className="p-5">
        <h3 className="text-base font-semibold mb-4" style={{ color: TEXTO }}>
          Datos de la certificación
        </h3>
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="flex flex-col gap-1.5">
            <label
              className="text-xs font-semibold uppercase tracking-wide"
              style={{ color: TEXTO_3 }}
            >
              Fecha
            </label>
            <input
              type="date"
              value={fecha}
              onChange={(e) => {
                setFecha(e.target.value);
                setExito(null);
              }}
              style={INPUT}
            />
          </div>
          <div className="flex flex-col gap-1.5 flex-1">
            <label
              className="text-xs font-semibold uppercase tracking-wide"
              style={{ color: TEXTO_3 }}
            >
              Descripción (opcional)
            </label>
            <input
              type="text"
              value={descripcion}
              placeholder="Ej: Mampostería planta baja"
              onChange={(e) => {
                setDescripcion(e.target.value);
                setExito(null);
              }}
              style={INPUT}
            />
          </div>
        </div>
      </section>

      {/* ── Ítems ejecutados ── */}
      <section style={GLASS_CARD} className="p-5">
        <div className="flex items-baseline justify-between mb-4">
          <h3 className="text-base font-semibold" style={{ color: TEXTO }}>
            Ítems ejecutados
          </h3>
          <span className="text-sm" style={{ color: TEXTO_2 }}>
            {tildados.size === 0
              ? 'Ninguno tildado'
              : `${tildados.size} ${tildados.size === 1 ? 'ítem tildado' : 'ítems tildados'}`}
          </span>
        </div>

        {datos.rubros.length === 0 && (
          <p className="text-sm" style={{ color: TEXTO_2 }}>
            Esta obra todavía no tiene ítems cargados en el cómputo.
          </p>
        )}

        <div className="flex flex-col gap-5">
          {datos.rubros.map((rubro) => {
            const idsDelRubro = rubro.items.map((i) => i.item_id);
            const todosTildados =
              idsDelRubro.length > 0 && idsDelRubro.every((id) => tildados.has(id));

            return (
              <div key={rubro.rubro_id}>
                <div
                  className="flex items-center gap-2 pb-1.5 mb-1"
                  style={{ borderBottom: BORDE_SUTIL }}
                >
                  <input
                    type="checkbox"
                    checked={todosTildados}
                    onChange={() => alternarRubro(idsDelRubro, todosTildados)}
                    className="w-4 h-4 cursor-pointer"
                    style={{ accentColor: ACENTO }}
                  />
                  <span className="text-sm font-semibold" style={{ color: TEXTO }}>
                    {rubro.rubro_nombre}
                  </span>
                </div>

                {rubro.items.map((item) => (
                  <label
                    key={item.item_id}
                    className="flex items-center gap-3 py-2 px-1 cursor-pointer rounded-lg transition-colors hover:bg-black/[0.02]"
                  >
                    <input
                      type="checkbox"
                      checked={tildados.has(item.item_id)}
                      onChange={() => alternarItem(item.item_id)}
                      className="w-4 h-4 cursor-pointer shrink-0"
                      style={{ accentColor: ACENTO }}
                    />
                    <span className="text-sm flex-1 truncate" style={{ color: TEXTO }}>
                      {item.descripcion}
                    </span>
                    <span className="text-sm tabular-nums" style={{ color: TEXTO_2 }}>
                      {formatNum(item.cantidad_total, item.unidad_medida)}
                    </span>
                    <span
                      className="text-xs w-10 text-left shrink-0"
                      style={{ color: TEXTO_3 }}
                    >
                      {item.unidad_medida}
                    </span>
                  </label>
                ))}
              </div>
            );
          })}
        </div>
      </section>

      {/* ── Material previsto vs. real ── */}
      <section style={GLASS_CARD} className="p-5">
        <div className="flex items-baseline justify-between mb-4">
          <h3 className="text-base font-semibold" style={{ color: TEXTO }}>
            Material consumido
          </h3>
          {calculando && (
            <span className="text-sm" style={{ color: TEXTO_2 }}>
              Calculando previsto…
            </span>
          )}
        </div>

        {errorPrevisto && (
          <div
            className="p-3 rounded-xl mb-4"
            style={{
              background: 'rgba(239, 68, 68, 0.12)',
              border: '1px solid rgba(239, 68, 68, 0.30)',
            }}
          >
            <p className="text-sm font-medium" style={{ color: '#DC2626' }}>
              {errorPrevisto}
            </p>
          </div>
        )}

        {itemIds.length === 0 && !errorPrevisto && (
          <p className="text-sm" style={{ color: TEXTO_2 }}>
            Tildá los ítems ejecutados para ver el material previsto.
          </p>
        )}

        {itemIds.length > 0 && filasMaterial.length === 0 && !calculando && !errorPrevisto && (
          <p className="text-sm" style={{ color: TEXTO_2 }}>
            Los ítems tildados no tienen materiales en sus recetas.
          </p>
        )}

        {filasMaterial.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px]">
              <thead>
                <tr>
                  <th
                    className="text-left text-[13px] font-semibold py-2 px-2"
                    style={{ color: TEXTO_2, borderBottom: BORDE_SUTIL }}
                  >
                    Material
                  </th>
                  <th
                    className="text-left text-[13px] font-semibold py-2 px-2 w-20"
                    style={{ color: TEXTO_2, borderBottom: BORDE_SUTIL }}
                  >
                    Unidad
                  </th>
                  <th
                    className="text-right text-[13px] font-semibold py-2 px-2 w-28"
                    style={{ color: TEXTO_2, borderBottom: BORDE_SUTIL }}
                  >
                    Previsto
                  </th>
                  <th
                    className="text-right text-[13px] font-semibold py-2 px-2 w-36"
                    style={{ color: TEXTO_2, borderBottom: BORDE_SUTIL }}
                  >
                    Real consumido
                  </th>
                </tr>
              </thead>
              <tbody>
                {filasMaterial.map((fila) => (
                  <tr key={fila.insumo_id}>
                    <td
                      className="text-sm py-2 px-2"
                      style={{ color: TEXTO, borderBottom: '1px solid rgba(0,0,0,0.04)' }}
                    >
                      {fila.nombre}
                      {fila.esExtra && (
                        <span
                          className="ml-2 text-[11px] px-2 py-0.5 rounded-full"
                          style={{ background: 'rgba(245, 166, 35, 0.15)', color: '#B45309' }}
                        >
                          no previsto
                        </span>
                      )}
                    </td>
                    <td
                      className="text-sm py-2 px-2"
                      style={{ color: TEXTO_3, borderBottom: '1px solid rgba(0,0,0,0.04)' }}
                    >
                      {fila.unidad_medida}
                    </td>
                    <td
                      className="text-sm py-2 px-2 text-right tabular-nums"
                      style={{ color: TEXTO_2, borderBottom: '1px solid rgba(0,0,0,0.04)' }}
                    >
                      {fila.esExtra ? '—' : formatNum(fila.cantidad_prevista, fila.unidad_medida)}
                    </td>
                    <td
                      className="py-1.5 px-2"
                      style={{ borderBottom: '1px solid rgba(0,0,0,0.04)' }}
                    >
                      <input
                        type="text"
                        inputMode="decimal"
                        value={reales[fila.insumo_id] ?? ''}
                        placeholder="0"
                        onChange={(e) => {
                          const valor = e.target.value;
                          setReales((prev) => ({ ...prev, [fila.insumo_id]: valor }));
                          setExito(null);
                        }}
                        style={{ ...INPUT, padding: '6px 10px', width: '100%', textAlign: 'right' }}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Material que las recetas no contemplaban */}
        {itemIds.length > 0 && (
          <div className="flex flex-wrap items-end gap-3 mt-4 pt-4" style={{ borderTop: BORDE_SUTIL }}>
            <div className="flex flex-col gap-1.5 flex-1 min-w-[220px]">
              <label
                className="text-xs font-semibold uppercase tracking-wide"
                style={{ color: TEXTO_3 }}
              >
                Agregar material no previsto
              </label>
              <select
                value={insumoAAgregar}
                onChange={(e) => setInsumoAAgregar(e.target.value)}
                style={{ ...INPUT, appearance: 'none' }}
              >
                <option value="">Elegí un material…</option>
                {materialesDisponibles.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.nombre} ({m.unidad_medida})
                  </option>
                ))}
              </select>
            </div>
            <button
              onClick={agregarExtra}
              disabled={insumoAAgregar === ''}
              className="text-sm font-medium transition-colors disabled:opacity-40"
              style={{
                padding: '8px 20px',
                border: `1.5px solid ${TEXTO}`,
                borderRadius: '9999px',
                color: TEXTO,
                background: 'transparent',
              }}
            >
              Agregar +
            </button>
          </div>
        )}
      </section>

      {/* ── Guardar ── */}
      <section style={GLASS_CARD} className="p-5 flex flex-col gap-3">
        {errorGuardar && (
          <div
            className="p-3 rounded-xl"
            style={{
              background: 'rgba(239, 68, 68, 0.12)',
              border: '1px solid rgba(239, 68, 68, 0.30)',
            }}
          >
            <p className="text-sm font-medium" style={{ color: '#DC2626' }}>
              {errorGuardar}
            </p>
          </div>
        )}

        {exito && (
          <div
            className="p-3 rounded-xl"
            style={{
              background: 'rgba(34, 197, 94, 0.12)',
              border: '1px solid rgba(34, 197, 94, 0.30)',
            }}
          >
            <p className="text-sm font-medium" style={{ color: '#15803D' }}>
              {exito}
            </p>
          </div>
        )}

        <div className="flex items-center justify-end gap-3">
          <button
            onClick={limpiar}
            disabled={guardando}
            className="text-sm font-medium transition-colors disabled:opacity-40"
            style={{
              padding: '10px 20px',
              border: `1.5px solid ${TEXTO}`,
              borderRadius: '9999px',
              color: TEXTO,
              background: 'transparent',
            }}
          >
            Limpiar
          </button>
          <button
            onClick={guardar}
            disabled={guardando || tildados.size === 0}
            className="text-sm font-semibold transition-colors disabled:opacity-40"
            style={{
              padding: '10px 24px',
              background: ACENTO,
              border: 'none',
              borderRadius: '9999px',
              color: ACENTO_TEXTO,
            }}
          >
            {guardando ? 'Guardando…' : 'Guardar certificación'}
          </button>
        </div>
      </section>
    </div>
  );
}

/* ─── Vista: Histórico ─────────────────────────────────────────────────────── */

/* Banda de tolerancia, solo de presentación: un desvío de menos de 1% se lee
 * como "en línea" en vez de pintarse de rojo por un decimal. No cambia ningún
 * número, solo el color y la etiqueta. */
const TOLERANCIA_PCT = 1;

type Severidad = 'de_mas' | 'de_menos' | 'en_linea' | 'no_previsto' | 'sin_consumo';

function clasificar(fila: CertificacionDesvioInsumo): Severidad {
  if (fila.origen === 'solo_real') return 'no_previsto';
  if (fila.origen === 'solo_previsto') return 'sin_consumo';
  if (fila.desvio_pct !== null && Math.abs(fila.desvio_pct) <= TOLERANCIA_PCT) {
    return 'en_linea';
  }
  return fila.desvio_cantidad > 0 ? 'de_mas' : 'de_menos';
}

const COLOR_SEVERIDAD: Record<Severidad, { texto: string; fondo: string; etiqueta: string }> = {
  de_mas: { texto: '#DC2626', fondo: 'rgba(239, 68, 68, 0.12)', etiqueta: 'de más' },
  de_menos: { texto: '#15803D', fondo: 'rgba(34, 197, 94, 0.12)', etiqueta: 'de menos' },
  en_linea: { texto: '#15803D', fondo: 'rgba(34, 197, 94, 0.10)', etiqueta: 'en línea' },
  no_previsto: { texto: '#B45309', fondo: 'rgba(245, 166, 35, 0.15)', etiqueta: 'no previsto' },
  sin_consumo: { texto: '#6B7080', fondo: 'rgba(107, 112, 128, 0.12)', etiqueta: 'sin consumo' },
};

/* Signo explícito y el mismo glifo de menos en las dos columnas del desvío:
 * Intl usa guión y quedaba desparejo al lado del menos tipográfico. */
function conSigno(v: number, cuerpo: string): string {
  if (v > 0) return `+${cuerpo}`;
  if (v < 0) return `−${cuerpo}`;
  return cuerpo;
}

function formatPct(v: number): string {
  const cuerpo =
    new Intl.NumberFormat('es-AR', { maximumFractionDigits: 1 }).format(Math.abs(v)) + '%';
  return conSigno(v, cuerpo);
}

function formatDesvio(v: number, unidad: string): string {
  return conSigno(v, formatNum(Math.abs(v), unidad));
}

function formatFecha(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return iso;
  return new Intl.DateTimeFormat('es-AR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(Date.UTC(y, m - 1, d)));
}

function TarjetaCertificacion({
  certificacion,
  onEliminar,
}: {
  certificacion: CertificacionConDesvio;
  onEliminar: (id: string) => Promise<void>;
}) {
  const [abierta, setAbierta] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const [borrando, setBorrando] = useState(false);
  const [errorBorrar, setErrorBorrar] = useState<string | null>(null);

  // Solo materiales: esta fase de certificación es de materiales.
  const materiales = useMemo(
    () => certificacion.desvio.filter((d) => d.tipo === 'material'),
    [certificacion.desvio],
  );

  const resumen = useMemo(() => {
    let deMas = 0;
    let deMenos = 0;
    let noPrevistos = 0;
    let sinConsumo = 0;
    for (const fila of materiales) {
      const sev = clasificar(fila);
      if (sev === 'de_mas') deMas++;
      else if (sev === 'de_menos') deMenos++;
      else if (sev === 'no_previsto') noPrevistos++;
      else if (sev === 'sin_consumo') sinConsumo++;
    }
    return { deMas, deMenos, noPrevistos, sinConsumo };
  }, [materiales]);

  const borrar = useCallback(async () => {
    setErrorBorrar(null);
    setBorrando(true);
    try {
      await onEliminar(certificacion.id);
      // No hace falta cerrar nada: la tarjeta se desmonta al salir de la lista.
    } catch (err) {
      setErrorBorrar((err as Error).message);
      setBorrando(false);
      setConfirmando(false);
    }
  }, [onEliminar, certificacion.id]);

  return (
    <div style={GLASS_CARD}>
      {/* ── Cabecera ── */}
      <div className="flex items-center gap-3 p-4">
        <button
          onClick={() => setAbierta((v) => !v)}
          className="flex items-center gap-3 flex-1 min-w-0 text-left"
        >
          <span
            className="text-xs shrink-0 transition-transform"
            style={{
              color: TEXTO_3,
              transform: abierta ? 'rotate(90deg)' : 'none',
              display: 'inline-block',
            }}
          >
            ▶
          </span>
          <span className="text-sm font-semibold shrink-0" style={{ color: TEXTO }}>
            {formatFecha(certificacion.fecha)}
          </span>
          <span className="text-sm truncate" style={{ color: TEXTO_2 }}>
            {certificacion.descripcion ?? 'Sin descripción'}
          </span>
        </button>

        {/* Resumen del desvío, para no tener que expandir */}
        <div className="flex items-center gap-1.5 shrink-0">
          <span className="text-xs" style={{ color: TEXTO_3 }}>
            {certificacion.items.length}{' '}
            {certificacion.items.length === 1 ? 'ítem' : 'ítems'}
          </span>
          {resumen.deMas > 0 && (
            <Chip severidad="de_mas" texto={`${resumen.deMas} de más`} />
          )}
          {resumen.deMenos > 0 && (
            <Chip severidad="de_menos" texto={`${resumen.deMenos} de menos`} />
          )}
          {resumen.noPrevistos > 0 && (
            <Chip severidad="no_previsto" texto={`${resumen.noPrevistos} no previsto`} />
          )}
          {resumen.sinConsumo > 0 && (
            <Chip severidad="sin_consumo" texto={`${resumen.sinConsumo} sin consumo`} />
          )}
        </div>

        {/* Borrar, con confirmación en línea */}
        {confirmando ? (
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-xs" style={{ color: TEXTO_2 }}>
              ¿Borrar?
            </span>
            <button
              onClick={borrar}
              disabled={borrando}
              className="text-xs font-semibold px-3 py-1 rounded-full disabled:opacity-40"
              style={{ background: 'rgba(239, 68, 68, 0.15)', color: '#DC2626' }}
            >
              {borrando ? 'Borrando…' : 'Sí, borrar'}
            </button>
            <button
              onClick={() => setConfirmando(false)}
              disabled={borrando}
              className="text-xs font-medium px-3 py-1 rounded-full disabled:opacity-40"
              style={{ color: TEXTO_2 }}
            >
              Cancelar
            </button>
          </div>
        ) : (
          <button
            onClick={() => setConfirmando(true)}
            className="text-xs font-medium px-3 py-1 rounded-full shrink-0 transition-colors hover:bg-black/[0.04]"
            style={{ color: TEXTO_3 }}
          >
            Borrar
          </button>
        )}
      </div>

      {errorBorrar && (
        <div className="px-4 pb-3">
          <div
            className="p-3 rounded-xl"
            style={{
              background: 'rgba(239, 68, 68, 0.12)',
              border: '1px solid rgba(239, 68, 68, 0.30)',
            }}
          >
            <p className="text-sm font-medium" style={{ color: '#DC2626' }}>
              {errorBorrar}
            </p>
          </div>
        </div>
      )}

      {/* ── Detalle ── */}
      {abierta && (
        <div className="px-4 pb-4" style={{ borderTop: BORDE_SUTIL }}>
          {/* Ítems ejecutados */}
          <div className="py-3">
            <p
              className="text-xs font-semibold uppercase tracking-wide mb-1.5"
              style={{ color: TEXTO_3 }}
            >
              Ítems ejecutados
            </p>
            <div className="flex flex-wrap gap-1.5">
              {certificacion.items.map((item) => (
                <span
                  key={item.item_id}
                  className="text-xs px-2.5 py-1 rounded-full"
                  style={{ background: 'rgba(0, 0, 0, 0.04)', color: TEXTO_2 }}
                >
                  {item.descripcion}
                  <span style={{ color: TEXTO_3 }}>
                    {' · '}
                    {formatNum(item.cantidad_ejecutada, item.unidad_medida)}{' '}
                    {item.unidad_medida}
                  </span>
                </span>
              ))}
            </div>
          </div>

          {/* Tabla de desvío */}
          {materiales.length === 0 ? (
            <p className="text-sm py-2" style={{ color: TEXTO_2 }}>
              Esta certificación no tiene materiales previstos ni consumo cargado.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px]">
                <thead>
                  <tr>
                    {['Material', 'Unidad'].map((h) => (
                      <th
                        key={h}
                        className="text-left text-[13px] font-semibold py-2 px-2"
                        style={{ color: TEXTO_2, borderBottom: BORDE_SUTIL }}
                      >
                        {h}
                      </th>
                    ))}
                    {['Previsto', 'Real', 'Desvío', '%'].map((h) => (
                      <th
                        key={h}
                        className="text-right text-[13px] font-semibold py-2 px-2 w-28"
                        style={{ color: TEXTO_2, borderBottom: BORDE_SUTIL }}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {materiales.map((fila) => {
                    const sev = clasificar(fila);
                    const color = COLOR_SEVERIDAD[sev];
                    const borde = '1px solid rgba(0,0,0,0.04)';
                    return (
                      <tr key={fila.insumo_id}>
                        <td className="text-sm py-2 px-2" style={{ color: TEXTO, borderBottom: borde }}>
                          {fila.nombre}
                          {(sev === 'no_previsto' || sev === 'sin_consumo') && (
                            <span
                              className="ml-2 text-[11px] px-2 py-0.5 rounded-full"
                              style={{ background: color.fondo, color: color.texto }}
                            >
                              {color.etiqueta}
                            </span>
                          )}
                        </td>
                        <td
                          className="text-sm py-2 px-2"
                          style={{ color: TEXTO_3, borderBottom: borde }}
                        >
                          {fila.unidad_medida}
                        </td>
                        <td
                          className="text-sm py-2 px-2 text-right tabular-nums"
                          style={{ color: TEXTO_2, borderBottom: borde }}
                        >
                          {formatNum(fila.cantidad_prevista, fila.unidad_medida)}
                        </td>
                        <td
                          className="text-sm py-2 px-2 text-right tabular-nums"
                          style={{ color: TEXTO, borderBottom: borde }}
                        >
                          {formatNum(fila.cantidad_real, fila.unidad_medida)}
                        </td>
                        <td
                          className="text-sm py-2 px-2 text-right tabular-nums font-medium"
                          style={{ color: color.texto, borderBottom: borde }}
                        >
                          {formatDesvio(fila.desvio_cantidad, fila.unidad_medida)}
                        </td>
                        <td
                          className="text-sm py-2 px-2 text-right tabular-nums font-medium"
                          style={{ color: color.texto, borderBottom: borde }}
                        >
                          {/* Sin previsto no hay porcentaje posible: se muestra
                              la diferencia en cantidad y acá va "n/a". */}
                          {fila.desvio_pct === null ? (
                            <span style={{ color: TEXTO_3 }}>n/a</span>
                          ) : (
                            formatPct(fila.desvio_pct)
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Chip({ severidad, texto }: { severidad: Severidad; texto: string }) {
  const color = COLOR_SEVERIDAD[severidad];
  return (
    <span
      className="text-[11px] px-2 py-0.5 rounded-full whitespace-nowrap"
      style={{ background: color.fondo, color: color.texto }}
    >
      {texto}
    </span>
  );
}

function VistaHistorico({
  lista,
  cargando,
  error,
  eliminarCertificacion,
}: {
  lista: CertificacionConDesvio[];
  cargando: boolean;
  error: string | null;
  eliminarCertificacion: CertificacionesHook['eliminarCertificacion'];
}) {
  // Más reciente primero: el endpoint las manda en orden cronológico y acá
  // interesa lo último ejecutado.
  const ordenadas = useMemo(() => lista.slice().reverse(), [lista]);

  if (cargando) {
    return (
      <div className="flex items-center justify-center h-40">
        <p style={{ color: TEXTO_2 }}>Cargando certificaciones…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div
        className="p-4 rounded-2xl"
        style={{
          background: 'rgba(239, 68, 68, 0.12)',
          border: '1px solid rgba(239, 68, 68, 0.30)',
        }}
      >
        <p className="text-sm font-medium" style={{ color: '#DC2626' }}>
          {error}
        </p>
      </div>
    );
  }

  if (ordenadas.length === 0) {
    return (
      <section style={GLASS_CARD} className="p-8 text-center">
        <p className="text-sm" style={{ color: TEXTO_2 }}>
          Todavía no registraste certificaciones en esta obra.
        </p>
        <p className="text-sm mt-1" style={{ color: TEXTO_3 }}>
          Cargá la primera desde la solapa Registrar.
        </p>
      </section>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {ordenadas.map((cert) => (
        <TarjetaCertificacion
          key={cert.id}
          certificacion={cert}
          onEliminar={eliminarCertificacion}
        />
      ))}
    </div>
  );
}

/* ─── Página ───────────────────────────────────────────────────────────────── */

type SubTabId = 'registrar' | 'historico';

const SUBTABS: { id: SubTabId; label: string }[] = [
  { id: 'registrar', label: 'Registrar' },
  { id: 'historico', label: 'Histórico' },
];

export default function CertificacionPage() {
  const params = useParams();
  const obraId = params.id as string;

  /* La lista de ítems por rubro con su cantidad total ya la arma el endpoint de
   * planificación, con exactamente la forma que necesita el checklist (y de ahí
   * sale también el nombre de la obra). Se reutiliza en vez de pedir rubros,
   * ítems y mediciones por separado desde el cliente. */
  const { datos, cargando, error } = usePlanificacion(obraId);

  /* El hook de certificaciones vive acá y no dentro de cada vista: así lo que
   * se guarda en Registrar aparece en Histórico sin volver a pedirlo. */
  const certificaciones = useCertificaciones(obraId);

  const [subtab, setSubtab] = useState<SubTabId>('registrar');

  return (
    <div
      className="flex flex-col h-screen overflow-hidden"
      style={{ backgroundColor: '#D5D4DC', background: MESH_GRADIENT }}
    >
      <ObraTabs obraId={obraId} activa="certificacion" obraNombre={datos?.obra_nombre ?? '…'} />

      <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-4">
        {cargando && (
          <div className="flex items-center justify-center h-64">
            <p style={{ color: TEXTO_2 }}>Cargando certificación…</p>
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
            <p className="text-sm font-medium" style={{ color: '#DC2626' }}>
              {error}
            </p>
          </div>
        )}

        {datos && !error && (
          <>
            {/* Sub-pestañas internas — mismo patrón que Planificación */}
            <div className="flex gap-6 px-1">
              {SUBTABS.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setSubtab(t.id)}
                  className="text-sm pb-2 transition-colors"
                  style={{
                    color: subtab === t.id ? TEXTO : TEXTO_2,
                    fontWeight: subtab === t.id ? 600 : 500,
                    borderBottom:
                      subtab === t.id ? `2px solid ${TEXTO}` : '2px solid transparent',
                  }}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {subtab === 'registrar' && (
              <VistaRegistrar
                datos={datos}
                calcularPrevisto={certificaciones.calcularPrevisto}
                crearCertificacion={certificaciones.crearCertificacion}
              />
            )}

            {subtab === 'historico' && (
              <VistaHistorico
                lista={certificaciones.lista}
                cargando={certificaciones.cargando}
                error={certificaciones.error}
                eliminarCertificacion={certificaciones.eliminarCertificacion}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}
