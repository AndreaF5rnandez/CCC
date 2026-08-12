'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { useRubros } from '@/hooks/useRubros';
import { ObraTabs } from '@/components/obras/ObraTabs';
import { useItems } from '@/hooks/useItems';
import { useMediciones } from '@/hooks/useMediciones';
import { useRecetas } from '@/hooks/useRecetas';
import { calcularPrecioReceta } from '@/lib/calculos';
import type { ItemConReceta, Medicion, RecetaConInsumos, Rubro } from '@/types';

/* ─── Helpers ──────────────────────────────────────────────────────────────── */

function formatPrecio(v: number) {
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(v);
}

function formatNum(v: number) {
  return new Intl.NumberFormat('es-AR', { maximumFractionDigits: 4 }).format(v);
}

const INPUT_MODAL =
  'w-full border border-black/[0.12] rounded-[10px] px-3.5 py-2.5 text-sm bg-white/60 backdrop-blur-[8px] focus:outline-none focus:border-[#C8E64C] focus:shadow-[0_0_0_3px_rgba(200,230,76,0.2)] transition-all placeholder:text-[#9CA3AF]';

const INPUT_FILA =
  'w-full border border-transparent rounded-[8px] px-2 py-1 text-sm bg-transparent focus:outline-none focus:border-black/[0.12] focus:bg-white/60 focus:shadow-[0_0_0_3px_rgba(200,230,76,0.2)] transition-all';

/* ─── FilaForm ─────────────────────────────────────────────────────────────── */

type FilaDim = number | '';
type FilaForm = { descripcion: string; n: FilaDim; largo: FilaDim; ancho: FilaDim; alto: FilaDim };

const FILA_INICIAL: FilaForm = { descripcion: '', n: 1, largo: '', ancho: '', alto: '' };

function medicionAForm(m: Medicion): FilaForm {
  return {
    descripcion: m.descripcion,
    n: m.n,
    largo: m.largo ?? '',
    ancho: m.ancho ?? '',
    alto: m.alto ?? '',
  };
}

/* ─── SeccionItem ──────────────────────────────────────────────────────────── */

function SeccionItem({
  item,
  onSubtotalChange,
  onEditar,
  onEliminar,
}: {
  item: ItemConReceta;
  onSubtotalChange: (itemId: string, subtotal: number) => void;
  onEditar: () => void;
  onEliminar: () => void;
}) {
  const { mediciones, cargando, crearMedicion, actualizarMedicion, eliminarMedicion } =
    useMediciones(item.id);

  const [fila, setFila] = useState<FilaForm>(FILA_INICIAL);
  const [guardandoFila, setGuardandoFila] = useState(false);
  const [errorFila, setErrorFila] = useState<string | null>(null);
  const descripcionRef = useRef<HTMLInputElement>(null);

  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<FilaForm>(FILA_INICIAL);

  const precioUnitario = item.receta ? calcularPrecioReceta(item.receta.ingredientes) : 0;
  const medicionesBase: Array<{ cantidad_calculada: number }> = cargando ? item.mediciones : mediciones;
  const cantidadTotal = medicionesBase.reduce((sum, m) => sum + m.cantidad_calculada, 0);
  const subtotal = cantidadTotal * precioUnitario;

  useEffect(() => {
    onSubtotalChange(item.id, subtotal);
  }, [item.id, subtotal, onSubtotalChange]);

  async function handleGuardarFila() {
    if (!fila.descripcion.trim() || guardandoFila) return;
    setGuardandoFila(true);
    setErrorFila(null);
    try {
      await crearMedicion({
        descripcion: fila.descripcion.trim(),
        n: typeof fila.n === 'number' ? fila.n : 1,
        largo: typeof fila.largo === 'number' ? fila.largo : undefined,
        ancho: typeof fila.ancho === 'number' ? fila.ancho : undefined,
        alto: typeof fila.alto === 'number' ? fila.alto : undefined,
      });
      setFila(FILA_INICIAL);
      setTimeout(() => descripcionRef.current?.focus(), 0);
    } catch (err) {
      setErrorFila(err instanceof Error ? err.message : 'Error al guardar');
    } finally {
      setGuardandoFila(false);
    }
  }

  function onKeyDownNueva(e: React.KeyboardEvent) {
    if (e.key === 'Enter') { e.preventDefault(); handleGuardarFila(); }
  }

  function entrarEdicion(m: Medicion) {
    setEditandoId(m.id);
    setEditForm(medicionAForm(m));
  }

  async function handleGuardarEdicion() {
    if (!editandoId) return;
    if (!editForm.descripcion.trim()) { setEditandoId(null); return; }
    try {
      await actualizarMedicion(editandoId, {
        descripcion: editForm.descripcion.trim(),
        n: typeof editForm.n === 'number' ? editForm.n : 1,
        largo: typeof editForm.largo === 'number' ? editForm.largo : undefined,
        ancho: typeof editForm.ancho === 'number' ? editForm.ancho : undefined,
        alto: typeof editForm.alto === 'number' ? editForm.alto : undefined,
      });
    } catch (err) {
      window.alert(err instanceof Error ? err.message : 'Error al guardar');
    } finally {
      setEditandoId(null);
    }
  }

  function onKeyDownEdicion(e: React.KeyboardEvent) {
    if (e.key === 'Enter') { e.preventDefault(); handleGuardarEdicion(); }
    if (e.key === 'Escape') { setEditandoId(null); }
  }

  return (
    <div
      className="rounded-2xl mb-4 overflow-hidden"
      style={{
        background: 'rgba(255, 255, 255, 0.55)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        border: '1px solid rgba(255, 255, 255, 0.60)',
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.06)',
      }}
    >
      {/* Cabecera del ítem */}
      <div
        className="px-4 py-3 flex items-start justify-between gap-4"
        style={{
          borderLeft: '3px solid #C8E64C',
          borderBottom: '1px solid rgba(0,0,0,0.06)',
        }}
      >
        <div className="min-w-0">
          <p className="font-medium truncate" style={{ color: '#1A1A2E' }}>{item.descripcion}</p>
          <p className="text-xs mt-0.5" style={{ color: '#6B7080' }}>
            {item.receta ? `${item.receta.nombre} · ` : ''}{item.unidad_medida}
          </p>
        </div>
        <div className="flex items-center gap-5 shrink-0">
          <div className="text-right">
            <p className="text-xs" style={{ color: '#9CA3AF' }}>Cantidad</p>
            <p className="text-sm font-medium font-mono tabular-nums" style={{ color: '#1A1A2E' }}>
              {formatNum(cantidadTotal)} {item.unidad_medida}
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs" style={{ color: '#9CA3AF' }}>P. Unitario</p>
            <p className="text-sm font-medium font-mono tabular-nums" style={{ color: item.receta ? '#1A1A2E' : '#9CA3AF' }}>
              {item.receta ? formatPrecio(precioUnitario) : 'Sin precio'}
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs" style={{ color: '#9CA3AF' }}>Subtotal</p>
            <p className="text-sm font-bold font-mono tabular-nums" style={{ color: item.receta ? '#1A1A2E' : '#9CA3AF' }}>
              {item.receta ? formatPrecio(subtotal) : '—'}
            </p>
          </div>
          <div className="flex gap-3">
            <button onClick={onEditar} className="text-xs font-medium hover:underline" style={{ color: '#C8E64C' }}>
              Editar
            </button>
            <button onClick={onEliminar} className="text-xs font-medium hover:underline" style={{ color: '#EF4444' }}>
              Eliminar
            </button>
          </div>
        </div>
      </div>

      {/* Tabla de mediciones */}
      {cargando ? (
        <p className="px-4 py-3 text-sm" style={{ color: '#6B7080' }}>Cargando mediciones…</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr style={{ borderBottom: '1px solid rgba(0,0,0,0.06)' }}>
              <th className="px-4 py-2 text-left" style={{ fontSize: '13px', fontWeight: 600, color: '#6B7080' }}>
                Descripción
              </th>
              {(['N', 'Largo', 'Ancho', 'Alto'] as const).map((h) => (
                <th key={h} className="px-3 py-2 text-right w-20" style={{ fontSize: '13px', fontWeight: 600, color: '#6B7080' }}>
                  {h}
                </th>
              ))}
              <th className="px-3 py-2 text-right w-24" style={{ fontSize: '13px', fontWeight: 600, color: '#6B7080' }}>
                Cantidad ({item.unidad_medida})
              </th>
              <th className="px-3 py-2 w-10" />
            </tr>
          </thead>
          <tbody>
            {mediciones.map((m) => {
              if (m.id === editandoId) {
                return (
                  <tr
                    key={m.id}
                    style={{ borderBottom: '1px solid rgba(0,0,0,0.04)', background: 'rgba(200,230,76,0.06)' }}
                    onBlur={(e) => {
                      if (!e.currentTarget.contains(e.relatedTarget as Node)) handleGuardarEdicion();
                    }}
                  >
                    <td className="px-4 py-1.5">
                      <input
                        autoFocus type="text" value={editForm.descripcion}
                        onChange={(e) => setEditForm((f) => ({ ...f, descripcion: e.target.value }))}
                        onKeyDown={onKeyDownEdicion}
                        className={INPUT_FILA} style={{ color: '#1A1A2E' }}
                      />
                    </td>
                    {(['n', 'largo', 'ancho', 'alto'] as const).map((campo) => (
                      <td key={campo} className="px-3 py-1.5">
                        <input
                          type="number" min="0" step="0.001"
                          value={editForm[campo] === '' ? '' : editForm[campo]}
                          onChange={(e) =>
                            setEditForm((f) => ({
                              ...f,
                              [campo]: e.target.value === '' ? '' : Number(e.target.value),
                            } as FilaForm))
                          }
                          onKeyDown={onKeyDownEdicion}
                          className={`${INPUT_FILA} text-right font-mono`}
                          style={{ color: '#1A1A2E' }}
                        />
                      </td>
                    ))}
                    <td className="px-3 py-2 text-right font-mono font-medium tabular-nums" style={{ color: '#6B7080' }}>
                      {formatNum(m.cantidad_calculada)}
                    </td>
                    <td className="px-3 py-1.5 text-center">
                      <button onClick={() => setEditandoId(null)} className="text-xl leading-none" style={{ color: '#9CA3AF' }}>×</button>
                    </td>
                  </tr>
                );
              }

              return (
                <tr
                  key={m.id}
                  onClick={() => entrarEdicion(m)}
                  className="hover:bg-black/[0.02] transition-colors cursor-pointer"
                  style={{ borderBottom: '1px solid rgba(0,0,0,0.04)' }}
                >
                  <td className="px-4 py-2" style={{ color: '#1A1A2E' }}>{m.descripcion}</td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums" style={{ color: '#6B7080' }}>{m.n}</td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums" style={{ color: '#6B7080' }}>{m.largo ?? '—'}</td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums" style={{ color: '#6B7080' }}>{m.ancho ?? '—'}</td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums" style={{ color: '#6B7080' }}>{m.alto ?? '—'}</td>
                  <td className="px-3 py-2 text-right font-mono font-semibold tabular-nums" style={{ color: '#1A1A2E' }}>
                    {formatNum(m.cantidad_calculada)}
                  </td>
                  <td className="px-3 py-2 text-center">
                    <button
                      onClick={async (e) => {
                        e.stopPropagation();
                        if (!window.confirm('¿Eliminás esta medición?')) return;
                        try { await eliminarMedicion(m.id); }
                        catch (err) { window.alert(err instanceof Error ? err.message : 'Error al eliminar'); }
                      }}
                      className="text-xl leading-none transition-colors"
                      style={{ color: '#9CA3AF' }}
                    >×</button>
                  </td>
                </tr>
              );
            })}

            {/* Fila nueva medición */}
            <tr style={{ borderTop: '2px solid rgba(200,230,76,0.3)' }}>
              <td className="px-4 py-1.5">
                <input
                  ref={descripcionRef}
                  type="text"
                  value={fila.descripcion}
                  onChange={(e) => setFila((f) => ({ ...f, descripcion: e.target.value }))}
                  onKeyDown={onKeyDownNueva}
                  placeholder="Descripción…"
                  className={INPUT_FILA}
                  style={{ color: '#1A1A2E' }}
                />
              </td>
              {(['n', 'largo', 'ancho', 'alto'] as const).map((campo) => (
                <td key={campo} className="px-3 py-1.5">
                  <input
                    type="number" min="0" step="0.001"
                    value={fila[campo] === '' ? '' : fila[campo]}
                    onChange={(e) =>
                      setFila((f) => ({
                        ...f,
                        [campo]: e.target.value === '' ? '' : Number(e.target.value),
                      } as FilaForm))
                    }
                    onKeyDown={onKeyDownNueva}
                    placeholder={campo === 'n' ? '1' : ''}
                    className={`${INPUT_FILA} text-right font-mono`}
                    style={{ color: '#1A1A2E' }}
                  />
                </td>
              ))}
              <td className="px-3 py-1.5" />
              <td className="px-3 py-1.5 text-center">
                <button
                  onClick={handleGuardarFila}
                  disabled={guardandoFila || !fila.descripcion.trim()}
                  title="Guardar (Enter)"
                  className="font-bold text-base leading-none disabled:opacity-30 transition-colors"
                  style={{ color: '#C8E64C' }}
                >↵</button>
              </td>
            </tr>

            {errorFila && (
              <tr>
                <td colSpan={7} className="px-4 py-1.5">
                  <div className="rounded-[10px] px-3 py-1.5 text-xs" style={{ background: '#FEE2E2', color: '#EF4444' }}>
                    {errorFila}
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      )}
    </div>
  );
}

/* ─── ContenidoRubro ───────────────────────────────────────────────────────── */

function ContenidoRubro({
  rubroId,
  rubroNombre,
  recetas,
  onSubtotalChange,
}: {
  rubroId: string;
  rubroNombre: string;
  recetas: RecetaConInsumos[];
  onSubtotalChange: (rubroId: string, subtotal: number) => void;
}) {
  const { items, cargando, error, crearItem, actualizarItem, eliminarItem } = useItems(rubroId);
  const [subtotalesPorItem, setSubtotalesPorItem] = useState<Record<string, number>>({});

  useEffect(() => {
    if (items.length === 0) return;
    setSubtotalesPorItem((prev) => {
      const itemIds = new Set(items.map((i) => i.id));
      const next: Record<string, number> = {};
      for (const id of itemIds) { next[id] = prev[id] ?? 0; }
      return next;
    });
  }, [items]);

  const subtotalRubro = Object.values(subtotalesPorItem).reduce((a, b) => a + b, 0);

  const handleSubtotalItem = useCallback((itemId: string, subtotal: number) => {
    setSubtotalesPorItem((prev) => {
      if (prev[itemId] === subtotal) return prev;
      return { ...prev, [itemId]: subtotal };
    });
  }, []);

  useEffect(() => {
    onSubtotalChange(rubroId, subtotalRubro);
  }, [rubroId, subtotalRubro, onSubtotalChange]);

  const [modalAbierto, setModalAbierto] = useState(false);
  const [itemEditando, setItemEditando] = useState<ItemConReceta | null>(null);
  const [formItem, setFormItem] = useState({ descripcion: '', unidad_medida: '', receta_id: '' });
  const [errorModal, setErrorModal] = useState<string | null>(null);
  const [guardandoModal, setGuardandoModal] = useState(false);

  function abrirCrear() {
    setItemEditando(null);
    setFormItem({ descripcion: '', unidad_medida: '', receta_id: '' });
    setErrorModal(null);
    setModalAbierto(true);
  }

  function abrirEditar(item: ItemConReceta) {
    setItemEditando(item);
    setFormItem({ descripcion: item.descripcion, unidad_medida: item.unidad_medida, receta_id: item.receta_id ?? '' });
    setErrorModal(null);
    setModalAbierto(true);
  }

  async function handleGuardarModal() {
    if (!formItem.descripcion.trim() || !formItem.unidad_medida || guardandoModal) return;
    setGuardandoModal(true);
    setErrorModal(null);
    try {
      if (itemEditando) {
        await actualizarItem(itemEditando.id, {
          descripcion: formItem.descripcion.trim(),
          unidad_medida: formItem.unidad_medida,
          receta_id: formItem.receta_id || null,
          orden: itemEditando.orden,
        });
      } else {
        await crearItem({
          descripcion: formItem.descripcion.trim(),
          unidad_medida: formItem.unidad_medida,
          receta_id: formItem.receta_id || null,
        });
      }
      setModalAbierto(false);
      setItemEditando(null);
    } catch (err) {
      setErrorModal(err instanceof Error ? err.message : 'Error al guardar');
    } finally {
      setGuardandoModal(false);
    }
  }

  async function handleEliminarItem(item: ItemConReceta) {
    if (!window.confirm(`¿Eliminás el ítem "${item.descripcion}"? Se eliminarán todas sus mediciones.`)) return;
    try { await eliminarItem(item.id); }
    catch (err) { window.alert(err instanceof Error ? err.message : 'Error al eliminar'); }
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold" style={{ color: '#1A1A2E' }}>{rubroNombre}</h2>
        <button
          onClick={abrirCrear}
          className="px-5 py-2 text-sm font-semibold transition-opacity hover:opacity-80"
          style={{ background: '#C8E64C', color: '#2A3300', borderRadius: '9999px' }}
        >
          + Nuevo ítem
        </button>
      </div>

      {cargando ? (
        <p className="text-center mt-16 text-sm" style={{ color: '#6B7080' }}>Cargando ítems…</p>
      ) : error ? (
        <div className="mx-auto max-w-md mt-16 rounded-2xl px-4 py-3 text-sm text-center" style={{ background: '#FEE2E2', color: '#EF4444' }}>
          {error}
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center justify-center mt-24 gap-3">
          <p className="text-sm" style={{ color: '#6B7080' }}>Este rubro no tiene ítems todavía.</p>
          <button
            onClick={abrirCrear}
            className="px-5 py-2.5 text-sm font-semibold transition-opacity hover:opacity-80"
            style={{ background: '#C8E64C', color: '#2A3300', borderRadius: '9999px' }}
          >
            + Agregar ítem
          </button>
        </div>
      ) : (
        <>
          {items.map((item) => (
            <SeccionItem
              key={item.id}
              item={item}
              onSubtotalChange={handleSubtotalItem}
              onEditar={() => abrirEditar(item)}
              onEliminar={() => handleEliminarItem(item)}
            />
          ))}

          {subtotalRubro > 0 && (
            <div className="flex justify-end mt-2 mb-4">
              <div
                className="rounded-2xl px-5 py-3 text-right"
                style={{ background: 'rgba(200,230,76,0.12)', border: '1px solid rgba(200,230,76,0.30)' }}
              >
                <p className="text-xs mb-0.5" style={{ color: '#6B7080' }}>Subtotal {rubroNombre}</p>
                <p className="text-xl font-bold font-mono tabular-nums" style={{ color: '#1A1A2E' }}>
                  {formatPrecio(subtotalRubro)}
                </p>
              </div>
            </div>
          )}
        </>
      )}

      {/* Modal ítem */}
      {modalAbierto && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div
            className="w-full max-w-md p-6"
            style={{
              background: 'rgba(255, 255, 255, 0.85)',
              backdropFilter: 'blur(24px)',
              WebkitBackdropFilter: 'blur(24px)',
              border: '1px solid rgba(255, 255, 255, 0.60)',
              borderRadius: '20px',
              boxShadow: '0 12px 40px rgba(0, 0, 0, 0.08)',
            }}
          >
            <h3 className="text-lg font-bold mb-5" style={{ color: '#1A1A2E' }}>
              {itemEditando ? 'Editar ítem' : 'Nuevo ítem'}
            </h3>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: '#1A1A2E' }}>Descripción</label>
                <input
                  type="text" value={formItem.descripcion}
                  onChange={(e) => setFormItem((f) => ({ ...f, descripcion: e.target.value }))}
                  placeholder="Ej: Exc. de V. Encadenado inferior"
                  className={INPUT_MODAL} style={{ color: '#1A1A2E' }} autoFocus
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: '#1A1A2E' }}>Unidad de medida</label>
                <select
                  value={formItem.unidad_medida}
                  onChange={(e) => setFormItem((f) => ({ ...f, unidad_medida: e.target.value }))}
                  className={INPUT_MODAL}
                  style={{ color: formItem.unidad_medida ? '#1A1A2E' : '#9CA3AF' }}
                >
                  <option value="">— Elegir unidad —</option>
                  {['m3','m2','m','u','kg','t','l','h','d','mes','km','ha','cm3','cm2','dm3','mu','cu','a'].map((u) => (
                    <option key={u} value={u}>{u}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: '#1A1A2E' }}>
                  Precio Unitario{' '}
                  <span className="font-normal" style={{ color: '#9CA3AF' }}>(opcional)</span>
                </label>
                <select
                  value={formItem.receta_id}
                  onChange={(e) => setFormItem((f) => ({ ...f, receta_id: e.target.value }))}
                  className={INPUT_MODAL}
                  style={{ color: formItem.receta_id ? '#1A1A2E' : '#9CA3AF' }}
                >
                  <option value="">— Sin precio por ahora —</option>
                  {recetas.map((r) => (
                    <option key={r.id} value={r.id}>{r.nombre} ({r.unidad_medida})</option>
                  ))}
                </select>
              </div>
            </div>

            {errorModal && (
              <div className="mt-4 rounded-[10px] px-3 py-2 text-sm" style={{ background: '#FEE2E2', color: '#EF4444' }}>
                {errorModal}
              </div>
            )}

            <div className="flex justify-between mt-6">
              <button
                onClick={() => { setModalAbierto(false); setItemEditando(null); }}
                disabled={guardandoModal}
                className="px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50"
                style={{ color: '#6B7080' }}
              >
                Cancelar
              </button>
              <button
                onClick={handleGuardarModal}
                disabled={guardandoModal || !formItem.descripcion.trim() || !formItem.unidad_medida}
                className="px-5 py-2 text-sm font-semibold transition-opacity hover:opacity-80 disabled:opacity-50"
                style={{ background: '#C8E64C', color: '#2A3300', borderRadius: '9999px' }}
              >
                {guardandoModal ? 'Guardando…' : itemEditando ? 'Guardar cambios' : 'Crear ítem'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Página principal ─────────────────────────────────────────────────────── */

const MESH_GRADIENT = [
  'radial-gradient(ellipse at 15% 80%, rgba(200, 230, 76, 0.12) 0%, transparent 50%)',
  'radial-gradient(ellipse at 85% 20%, rgba(200, 180, 220, 0.15) 0%, transparent 50%)',
  'radial-gradient(ellipse at 80% 85%, rgba(180, 220, 210, 0.12) 0%, transparent 50%)',
  'radial-gradient(ellipse at 50% 50%, rgba(215, 210, 220, 0.3) 0%, transparent 70%)',
  'linear-gradient(135deg, #D8D6DE 0%, #CDCBD5 50%, #D2D0D8 100%)',
].join(', ');

export default function MedicionPage() {
  const params = useParams();
  const obraId = params.id as string;

  const { rubros, cargando: cargandoRubros, error: errorRubros, crearRubro, eliminarRubro } = useRubros(obraId);
  const { recetas } = useRecetas();

  const [obraNombre, setObraNombre] = useState('');
  const [rubroSeleccionadoId, setRubroSeleccionadoId] = useState<string | null>(null);

  /*
   * FIX 1: subtotales se inicializa desde GET /api/presupuesto/[obraId] al cargar la página.
   * La API devuelve lineas[] con { rubro_id, subtotal }. Sumamos por rubro_id y guardamos
   * en este Record. El callback onSubtotalChange (desde ContenidoRubro) actualiza el valor
   * en vivo cuando el usuario navega y edita mediciones.
   * NUNCA mostramos '—': si el valor es 0 (sin precios), mostramos $ 0,00.
   */
  const [subtotales, setSubtotales] = useState<Record<string, number>>({});

  const [agregandoRubro, setAgregandoRubro] = useState(false);
  const [nuevoRubroNombre, setNuevoRubroNombre] = useState('');
  const [guardandoRubro, setGuardandoRubro] = useState(false);
  const [errorNuevoRubro, setErrorNuevoRubro] = useState<string | null>(null);

  const nuevoRubroRef = useRef<HTMLInputElement>(null);
  const nuevoRubroLiRef = useRef<HTMLLIElement>(null);

  /* Nombre de la obra */
  useEffect(() => {
    fetch(`/api/obras/${obraId}`)
      .then((res) => res.json())
      .then((data: unknown) => {
        if (data && typeof data === 'object' && 'nombre' in data) {
          setObraNombre((data as { nombre: string }).nombre);
        }
      })
      .catch(() => {});
  }, [obraId]);

  /*
   * FIX 1: fetch inicial de subtotales por rubro desde la API de presupuesto.
   * Suma todos los subtotales de las líneas agrupando por rubro_id.
   * Si el fetch falla, subtotales queda en {} y todos muestran $ 0,00.
   */
  useEffect(() => {
    fetch(`/api/presupuesto/${obraId}`)
      .then((res) => res.json())
      .then((data: unknown) => {
        if (
          !data ||
          typeof data !== 'object' ||
          !('lineas' in data) ||
          !Array.isArray((data as { lineas: unknown }).lineas)
        ) return;

        type Linea = { rubro_id: string; subtotal: number };
        const porRubro: Record<string, number> = {};
        for (const linea of (data as { lineas: Linea[] }).lineas) {
          porRubro[linea.rubro_id] = (porRubro[linea.rubro_id] ?? 0) + linea.subtotal;
        }
        setSubtotales((prev) => ({ ...prev, ...porRubro }));
      })
      .catch(() => {});
  }, [obraId]);

  /* Auto-seleccionar primer rubro */
  useEffect(() => {
    if (!cargandoRubros && rubros.length > 0 && rubroSeleccionadoId === null) {
      setRubroSeleccionadoId(rubros[0].id);
    }
  }, [cargandoRubros, rubros, rubroSeleccionadoId]);

  /* Scroll + foco al abrir el input de nuevo rubro */
  useEffect(() => {
    if (agregandoRubro) {
      nuevoRubroLiRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      setTimeout(() => nuevoRubroRef.current?.focus(), 50);
    }
  }, [agregandoRubro]);

  /* Actualización en vivo desde ContenidoRubro (navegación activa) */
  const handleSubtotalChange = useCallback((rubroId: string, subtotal: number) => {
    setSubtotales((prev) => {
      if (prev[rubroId] === subtotal) return prev;
      return { ...prev, [rubroId]: subtotal };
    });
  }, []);

  async function handleCrearRubro() {
    if (!nuevoRubroNombre.trim() || guardandoRubro) return;
    setGuardandoRubro(true);
    setErrorNuevoRubro(null);
    try {
      const nuevo = await crearRubro(nuevoRubroNombre.trim());
      setNuevoRubroNombre('');
      setAgregandoRubro(false);
      setRubroSeleccionadoId(nuevo.id);
    } catch (err) {
      setErrorNuevoRubro(err instanceof Error ? err.message : 'Error al crear rubro');
    } finally {
      setGuardandoRubro(false);
    }
  }

  async function handleEliminarRubro(rubro: Rubro) {
    if (!window.confirm(`¿Eliminás "${rubro.nombre}"? Se eliminarán todos sus ítems y mediciones.`)) return;
    try {
      await eliminarRubro(rubro.id);
      if (rubroSeleccionadoId === rubro.id) {
        const restantes = rubros.filter((r) => r.id !== rubro.id);
        setRubroSeleccionadoId(restantes.length > 0 ? restantes[0].id : null);
      }
    } catch (err) {
      window.alert(err instanceof Error ? err.message : 'Error al eliminar');
    }
  }

  const rubroSeleccionado = rubros.find((r) => r.id === rubroSeleccionadoId) ?? null;

  return (
    <div
      className="flex flex-col h-full"
      style={{ backgroundColor: '#D5D4DC', background: MESH_GRADIENT }}
    >
      {/* ── Barra superior ── */}
      <ObraTabs obraId={obraId} activa="medicion" obraNombre={obraNombre} />

      {/* ── Dos paneles ── */}
      <div className="flex flex-1 min-h-0">

        {/*
         * FIX 2: background rgba(255,255,255,0.55) + blur(20px) + border-right rgba(255,255,255,0.60)
         * FIX 3: border-left rgba(0,0,0,0.10) para separación visual del sidebar de navegación
         */}
        <aside
          className="w-[260px] shrink-0 flex flex-col overflow-hidden"
          style={{
            background: 'rgba(255, 255, 255, 0.55)',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            borderLeft: '1px solid rgba(0, 0, 0, 0.10)',
            borderRight: '1px solid rgba(0, 0, 0, 0.08)',
          }}
        >
          {/* Header del panel */}
          <div
            className="px-4 py-3 flex items-center justify-between shrink-0"
            style={{ borderBottom: '1px solid rgba(0, 0, 0, 0.06)' }}
          >
            <span className="text-sm font-semibold" style={{ color: '#1A1A2E' }}>Rubros</span>
            <button
              onClick={() => setAgregandoRubro(true)}
              disabled={agregandoRubro}
              className="w-7 h-7 flex items-center justify-center text-sm font-bold transition-opacity hover:opacity-80 disabled:opacity-40"
              style={{ background: '#C8E64C', color: '#2A3300', borderRadius: '9999px' }}
              title="Nuevo rubro"
            >
              +
            </button>
          </div>

          {/* Lista */}
          {cargandoRubros ? (
            <div className="flex-1 flex items-center justify-center">
              <p className="text-sm" style={{ color: '#6B7080' }}>Cargando…</p>
            </div>
          ) : errorRubros ? (
            <div className="flex-1 flex items-center justify-center px-4">
              <p className="text-sm text-center" style={{ color: '#EF4444' }}>{errorRubros}</p>
            </div>
          ) : (
            <ul className="flex-1 overflow-y-auto py-2">

              {/* Input nuevo rubro — primer elemento de la lista */}
              {agregandoRubro && (
                <li
                  ref={nuevoRubroLiRef}
                  className="px-2 pb-3"
                  style={{ borderBottom: '1px solid rgba(0, 0, 0, 0.06)' }}
                >
                  <input
                    ref={nuevoRubroRef}
                    type="text"
                    value={nuevoRubroNombre}
                    onChange={(e) => setNuevoRubroNombre(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') { e.preventDefault(); handleCrearRubro(); }
                      if (e.key === 'Escape') {
                        setAgregandoRubro(false);
                        setNuevoRubroNombre('');
                        setErrorNuevoRubro(null);
                      }
                    }}
                    placeholder="Nombre del rubro…"
                    disabled={guardandoRubro}
                    className="mt-2 w-full border border-black/[0.12] rounded-[10px] px-2.5 py-2 text-sm bg-white/60 focus:outline-none focus:border-[#C8E64C] focus:shadow-[0_0_0_3px_rgba(200,230,76,0.2)] transition-all placeholder:text-[#9CA3AF]"
                    style={{ color: '#1A1A2E' }}
                  />
                  {errorNuevoRubro && (
                    <div className="mt-1 rounded-[8px] px-2 py-1 text-xs" style={{ background: '#FEE2E2', color: '#EF4444' }}>
                      {errorNuevoRubro}
                    </div>
                  )}
                  <div className="flex gap-2 mt-2">
                    <button
                      onClick={handleCrearRubro}
                      disabled={guardandoRubro || !nuevoRubroNombre.trim()}
                      className="flex-1 text-xs py-1.5 font-semibold disabled:opacity-40 transition-opacity hover:opacity-80"
                      style={{ background: '#C8E64C', color: '#2A3300', borderRadius: '9999px' }}
                    >
                      {guardandoRubro ? '…' : 'Crear'}
                    </button>
                    <button
                      onClick={() => { setAgregandoRubro(false); setNuevoRubroNombre(''); setErrorNuevoRubro(null); }}
                      className="flex-1 text-xs py-1.5 font-medium transition-colors hover:bg-black/[0.04]"
                      style={{ color: '#6B7080', borderRadius: '9999px' }}
                    >
                      Cancelar
                    </button>
                  </div>
                </li>
              )}

              {/* Estado vacío */}
              {rubros.length === 0 && !agregandoRubro && (
                <li className="flex flex-col items-center justify-center px-5 py-16 text-center">
                  <p className="text-sm font-medium mb-1" style={{ color: '#1A1A2E' }}>Creá tu primer rubro</p>
                  <p className="text-xs leading-relaxed" style={{ color: '#6B7080' }}>
                    Ej: Excavación, Hormigón Armado
                  </p>
                </li>
              )}

              {/*
               * FIX 1: siempre muestra formatPrecio(subtotales[rubro.id] ?? 0).
               * El valor viene del fetch de /api/presupuesto/[obraId] (inicialización)
               * y se actualiza en vivo vía handleSubtotalChange cuando el rubro está activo.
               * NUNCA muestra '—': $ 0,00 cuando no hay precios asignados.
               */}
              {rubros.map((rubro) => {
                const activo = rubro.id === rubroSeleccionadoId;
                return (
                  <li key={rubro.id} className="group px-2 py-0.5">
                    <div
                      className="flex items-center overflow-hidden transition-all duration-150"
                      style={{ background: activo ? '#C8E64C' : 'transparent', borderRadius: '12px' }}
                    >
                      <button
                        onClick={() => setRubroSeleccionadoId(rubro.id)}
                        className={`flex-1 min-w-0 text-left px-3 py-2.5 flex items-center justify-between gap-2 transition-colors ${!activo ? 'hover:bg-black/[0.04]' : ''}`}
                        style={{
                          color: activo ? '#2A3300' : '#1A1A2E',
                          fontWeight: activo ? 600 : 500,
                          borderRadius: '12px',
                        }}
                      >
                        <span className="text-sm truncate">{rubro.nombre}</span>
                        <span
                          className="text-xs font-mono tabular-nums shrink-0"
                          style={{ color: activo ? '#2A3300' : '#9CA3AF' }}
                        >
                          {formatPrecio(subtotales[rubro.id] ?? 0)}
                        </span>
                      </button>
                      <button
                        onClick={() => handleEliminarRubro(rubro)}
                        title="Eliminar rubro"
                        className="pr-2 pl-1 py-2 opacity-0 group-hover:opacity-100 transition-opacity text-xl leading-none"
                        style={{ color: activo ? '#2A3300' : '#9CA3AF' }}
                      >
                        ×
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </aside>

        {/* ── Panel derecho ── */}
        <section
          className="flex-1 overflow-y-auto"
          style={{
            background: 'rgba(255, 255, 255, 0.55)',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
          }}
        >
          {rubroSeleccionado === null ? (
            <div className="flex flex-col items-center justify-center gap-4 h-full">
              {rubros.length === 0 && !cargandoRubros ? (
                <>
                  <div className="text-center">
                    <p className="text-sm font-medium mb-1" style={{ color: '#1A1A2E' }}>
                      Creá tu primer rubro para empezar
                    </p>
                    <p className="text-xs" style={{ color: '#9CA3AF' }}>
                      Ej: Excavación, Hormigón Armado, Mampostería
                    </p>
                  </div>
                  <button
                    onClick={() => setAgregandoRubro(true)}
                    className="px-5 py-2.5 text-sm font-semibold transition-opacity hover:opacity-80"
                    style={{ background: '#C8E64C', color: '#2A3300', borderRadius: '9999px' }}
                  >
                    + Crear primer rubro
                  </button>
                </>
              ) : (
                <p className="text-sm" style={{ color: '#6B7080' }}>
                  Seleccioná un rubro para ver sus ítems.
                </p>
              )}
            </div>
          ) : (
            <ContenidoRubro
              key={rubroSeleccionadoId!}
              rubroId={rubroSeleccionadoId!}
              rubroNombre={rubroSeleccionado.nombre}
              recetas={recetas}
              onSubtotalChange={handleSubtotalChange}
            />
          )}
        </section>
      </div>
    </div>
  );
}
