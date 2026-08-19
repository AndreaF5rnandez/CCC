'use client';

import { useCallback, useMemo, useState } from 'react';
import {
  BORDE_FILA,
  BORDE_SUTIL,
  GLASS_CARD,
  ROJO,
  ROJO_FONDO,
  TEXTO,
  TEXTO_2,
  TEXTO_3,
} from '@/components/ui/estiloPragma';
import { formatDesvio, formatFecha, formatNum, formatPct, pluralizar, unidadDeCarga } from '@/lib/formato';
import {
  AvisoError,
  COLOR_SEVERIDAD,
  Chip,
  clasificar,
  clasificarComputo,
  esFuerte,
} from './severidad';
import type { CertificacionConDesvio, CertificacionMedicionDesvio } from '@/types';

/**
 * Una certificación en la lista: cabecera con el resumen, y al abrirla el
 * detalle completo — desvío de MATERIAL (previsto vs consumido) y desvío de
 * CÓMPUTO (medido vs lo que realmente salió).
 *
 * Ninguno de los dos se calcula acá: los dos vienen resueltos del backend.
 */
export function TarjetaCertificacion({
  certificacion,
  editando,
  onEditar,
  onEliminar,
}: {
  certificacion: CertificacionConDesvio;
  /** true si esta misma certificación es la que está abierta en el formulario. */
  editando: boolean;
  onEditar: () => void;
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

  // Mediciones que salieron distinto de como se midieron.
  const corregidas = certificacion.desvio_computo.mediciones_con_medida_real;

  /* Las mediciones del desvío de cómputo, agrupadas bajo su ítem: en pantalla
   * se lee "Mampostería → Pared 5", no una lista plana de paredes. */
  const porItem = useMemo(() => {
    const grupos = new Map<string, CertificacionMedicionDesvio[]>();
    for (const fila of certificacion.desvio_computo.mediciones) {
      const lista = grupos.get(fila.item_id) ?? [];
      lista.push(fila);
      grupos.set(fila.item_id, lista);
    }
    return grupos;
  }, [certificacion.desvio_computo.mediciones]);

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
    <div
      style={{
        ...GLASS_CARD,
        // La que se está editando queda marcada, para no perderla de vista
        // mientras el formulario está abierto arriba.
        border: editando ? '1px solid rgba(200, 230, 76, 0.9)' : GLASS_CARD.border,
      }}
    >
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

        {/* Resumen, para no tener que expandir */}
        <div className="flex items-center gap-1.5 shrink-0 flex-wrap justify-end">
          <span className="text-xs" style={{ color: TEXTO_3 }}>
            {certificacion.items.length} {certificacion.items.length === 1 ? 'ítem' : 'ítems'}
          </span>
          {corregidas > 0 && (
            <Chip
              severidad="no_previsto"
              texto={`${corregidas} ${corregidas === 1 ? 'medida corregida' : 'medidas corregidas'}`}
            />
          )}
          {resumen.deMas > 0 && <Chip severidad="de_mas" texto={`${resumen.deMas} de más`} />}
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

        {/* Editar y borrar */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={onEditar}
            className="text-xs font-medium px-3 py-1 rounded-full transition-colors hover:bg-black/[0.04]"
            style={{ color: TEXTO_2, border: BORDE_SUTIL }}
          >
            {editando ? 'Editando…' : 'Editar'}
          </button>

          {confirmando ? (
            <div className="flex items-center gap-2">
              <span className="text-xs" style={{ color: TEXTO_2 }}>
                ¿Borrar?
              </span>
              <button
                onClick={borrar}
                disabled={borrando}
                className="text-xs font-semibold px-3 py-1 rounded-full disabled:opacity-40"
                style={{ background: ROJO_FONDO, color: ROJO }}
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
              className="text-xs font-medium px-3 py-1 rounded-full transition-colors hover:bg-black/[0.04]"
              style={{ color: TEXTO_3 }}
            >
              Borrar
            </button>
          )}
        </div>
      </div>

      {errorBorrar && (
        <div className="px-4 pb-3">
          <AvisoError mensaje={errorBorrar} />
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
                  {/* Si las medidas reales corrieron la cantidad, se dice con
                      cuánto se calculó el material y de dónde salió. */}
                  {item.ajuste_medidas_reales !== 0 && (
                    <span style={{ color: TEXTO_3 }}>
                      {' ('}
                      {formatNum(item.cantidad_planificada, item.unidad_medida)} medidos{' '}
                      {formatDesvio(item.ajuste_medidas_reales, item.unidad_medida)}
                      {')'}
                    </span>
                  )}
                </span>
              ))}
            </div>
          </div>

          {/* ── Desvío de cómputo ── */}
          <DesvioComputo certificacion={certificacion} porItem={porItem} />

          {/* ── Desvío de material ── */}
          <p
            className="text-xs font-semibold uppercase tracking-wide mb-1.5 mt-4"
            style={{ color: TEXTO_3 }}
          >
            Material: previsto vs. consumido
          </p>
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
                    const fuerte = esFuerte(fila.desvio_pct);
                    /* Todo llega en unidad base; se muestra en unidad de compra
                     * cuando hay factor, que es como el encargado lo piensa.
                     * Dividir las tres por la misma constante mantiene la
                     * resta coherente, y el porcentaje no cambia. */
                    const { unidad, factor, convertido } = unidadDeCarga(fila);
                    return (
                      <tr key={fila.insumo_id}>
                        <td
                          className="text-sm py-2 px-2"
                          style={{ color: TEXTO, borderBottom: BORDE_FILA }}
                        >
                          {fila.nombre}
                          {(sev === 'no_previsto' || sev === 'sin_consumo') && (
                            <span className="ml-2">
                              <Chip severidad={sev} texto={color.etiqueta} />
                            </span>
                          )}
                        </td>
                        <td
                          className="text-sm py-2 px-2"
                          style={{ color: TEXTO_3, borderBottom: BORDE_FILA }}
                        >
                          {pluralizar(2, unidad)}
                          {convertido && (
                            <span className="block text-[11px]" style={{ color: TEXTO_3 }}>
                              de {fila.unidad_medida}
                            </span>
                          )}
                        </td>
                        <td
                          className="text-sm py-2 px-2 text-right tabular-nums"
                          style={{ color: TEXTO_2, borderBottom: BORDE_FILA }}
                        >
                          {formatNum(fila.cantidad_prevista / factor, unidad)}
                        </td>
                        <td
                          className="text-sm py-2 px-2 text-right tabular-nums"
                          style={{ color: TEXTO, borderBottom: BORDE_FILA }}
                        >
                          {formatNum(fila.cantidad_real / factor, unidad)}
                        </td>
                        <td
                          className="text-sm py-2 px-2 text-right tabular-nums"
                          style={{
                            color: color.texto,
                            fontWeight: fuerte ? 700 : 500,
                            borderBottom: BORDE_FILA,
                          }}
                        >
                          {formatDesvio(fila.desvio_cantidad / factor, unidad)}
                        </td>
                        <td
                          className="text-sm py-2 px-2 text-right tabular-nums"
                          style={{
                            color: color.texto,
                            fontWeight: fuerte ? 700 : 500,
                            borderBottom: BORDE_FILA,
                          }}
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

/* ─── Desvío de cómputo: lo medido contra lo que salió ─────────────────────── */

function DesvioComputo({
  certificacion,
  porItem,
}: {
  certificacion: CertificacionConDesvio;
  porItem: Map<string, CertificacionMedicionDesvio[]>;
}) {
  const { items, mediciones } = certificacion.desvio_computo;

  if (mediciones.length === 0) {
    return (
      <>
        <p
          className="text-xs font-semibold uppercase tracking-wide mb-1.5"
          style={{ color: TEXTO_3 }}
        >
          Cómputo: medido vs. ejecutado
        </p>
        <p className="text-sm py-2" style={{ color: TEXTO_2 }}>
          Esta certificación no tiene mediciones detalladas, así que no hay desvío de cómputo
          para mostrar.
        </p>
      </>
    );
  }

  return (
    <>
      <p
        className="text-xs font-semibold uppercase tracking-wide mb-1.5"
        style={{ color: TEXTO_3 }}
      >
        Cómputo: medido vs. ejecutado
      </p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px]">
          <thead>
            <tr>
              <th
                className="text-left text-[13px] font-semibold py-2 px-2"
                style={{ color: TEXTO_2, borderBottom: BORDE_SUTIL }}
              >
                Medición
              </th>
              {['Medido', 'Ejecutado', 'Desvío', '%'].map((h) => (
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
            {items.map((item) => {
              const filas = porItem.get(item.item_id) ?? [];
              const sevItem = clasificarComputo(item.desvio_cantidad, item.desvio_pct);
              const colorItem = COLOR_SEVERIDAD[sevItem];

              return (
                <FilasDeItem
                  key={item.item_id}
                  descripcion={item.descripcion}
                  rubro={item.rubro_nombre}
                  unidad={item.unidad_medida}
                  filas={filas}
                  totalPlanificado={item.cantidad_planificada}
                  totalReal={item.cantidad_real}
                  totalDesvio={item.desvio_cantidad}
                  totalPct={item.desvio_pct}
                  colorTotal={colorItem.texto}
                  fuerteTotal={esFuerte(item.desvio_pct)}
                />
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

function FilasDeItem({
  descripcion,
  rubro,
  unidad,
  filas,
  totalPlanificado,
  totalReal,
  totalDesvio,
  totalPct,
  colorTotal,
  fuerteTotal,
}: {
  descripcion: string;
  rubro: string;
  unidad: string;
  filas: CertificacionMedicionDesvio[];
  totalPlanificado: number;
  totalReal: number;
  totalDesvio: number;
  totalPct: number | null;
  colorTotal: string;
  fuerteTotal: boolean;
}) {
  return (
    <>
      {/* Subtotal del ítem primero: es el número que importa; las mediciones
          que lo componen van debajo, en chico. */}
      <tr>
        <td className="py-2 px-2" style={{ borderBottom: BORDE_FILA }}>
          <span className="text-sm font-medium" style={{ color: TEXTO }}>
            {descripcion}
          </span>
          <span className="block text-[11px]" style={{ color: TEXTO_3 }}>
            {rubro}
          </span>
        </td>
        <td
          className="text-sm py-2 px-2 text-right tabular-nums"
          style={{ color: TEXTO_2, borderBottom: BORDE_FILA }}
        >
          {formatNum(totalPlanificado, unidad)}
        </td>
        <td
          className="text-sm py-2 px-2 text-right tabular-nums"
          style={{ color: TEXTO, borderBottom: BORDE_FILA }}
        >
          {formatNum(totalReal, unidad)}
        </td>
        <td
          className="text-sm py-2 px-2 text-right tabular-nums"
          style={{
            color: colorTotal,
            fontWeight: fuerteTotal ? 700 : 600,
            borderBottom: BORDE_FILA,
          }}
        >
          {formatDesvio(totalDesvio, unidad)}
        </td>
        <td
          className="text-sm py-2 px-2 text-right tabular-nums"
          style={{
            color: colorTotal,
            fontWeight: fuerteTotal ? 700 : 600,
            borderBottom: BORDE_FILA,
          }}
        >
          {totalPct === null ? <span style={{ color: TEXTO_3 }}>n/a</span> : formatPct(totalPct)}
        </td>
      </tr>

      {filas.map((fila) => {
        const sev = clasificarComputo(fila.desvio_cantidad, fila.desvio_pct);
        const color = COLOR_SEVERIDAD[sev];
        const sinCorregir = fila.real === null;
        return (
          <tr key={fila.medicion_id}>
            <td className="py-1.5 px-2 pl-6" style={{ borderBottom: BORDE_FILA }}>
              <span className="text-[13px]" style={{ color: TEXTO_2 }}>
                {fila.descripcion}
              </span>
              {sinCorregir ? (
                <span className="ml-2 text-[11px]" style={{ color: TEXTO_3 }}>
                  salió como se midió
                </span>
              ) : (
                <span className="ml-2">
                  <Chip
                    severidad={sev}
                    texto={`salió ${formatMedidas(fila)}`}
                    fuerte={esFuerte(fila.desvio_pct)}
                  />
                </span>
              )}
            </td>
            <td
              className="text-[13px] py-1.5 px-2 text-right tabular-nums"
              style={{ color: TEXTO_3, borderBottom: BORDE_FILA }}
            >
              {formatNum(fila.cantidad_planificada, fila.unidad_medida)}
            </td>
            <td
              className="text-[13px] py-1.5 px-2 text-right tabular-nums"
              style={{ color: TEXTO_2, borderBottom: BORDE_FILA }}
            >
              {formatNum(fila.cantidad_real, fila.unidad_medida)}
            </td>
            <td
              className="text-[13px] py-1.5 px-2 text-right tabular-nums"
              style={{
                color: sinCorregir ? TEXTO_3 : color.texto,
                borderBottom: BORDE_FILA,
              }}
            >
              {formatDesvio(fila.desvio_cantidad, fila.unidad_medida)}
            </td>
            <td
              className="text-[13px] py-1.5 px-2 text-right tabular-nums"
              style={{
                color: sinCorregir ? TEXTO_3 : color.texto,
                borderBottom: BORDE_FILA,
              }}
            >
              {fila.desvio_pct === null ? (
                <span style={{ color: TEXTO_3 }}>n/a</span>
              ) : (
                formatPct(fila.desvio_pct)
              )}
            </td>
          </tr>
        );
      })}
    </>
  );
}

/** Las medidas reales de una medición corregida: 1 · 8 · 3. */
function formatMedidas(fila: CertificacionMedicionDesvio): string {
  if (!fila.real) return '';
  const numero = (v: number | null) =>
    v === null ? null : new Intl.NumberFormat('es-AR', { maximumFractionDigits: 2 }).format(v);
  return [numero(fila.real.n), numero(fila.real.largo), numero(fila.real.ancho), numero(fila.real.alto)]
    .filter((v): v is string => v !== null)
    .join(' · ');
}

export default TarjetaCertificacion;
