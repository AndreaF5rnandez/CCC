'use client';

import {
  BORDE_FILA,
  BORDE_SUTIL,
  GLASS_CARD,
  ROJO,
  TEXTO,
  TEXTO_2,
  TEXTO_3,
  VERDE,
} from '@/components/ui/estiloPragma';
import {
  formatDesvioPrecio,
  formatNum,
  formatPct,
  formatPrecio,
  pluralizar,
  unidadDeCarga,
} from '@/lib/formato';
import type { ControlMaterial, ControlRubro } from '@/types';

/* Las dos tablas de detalle del control.
 *
 * Están partidas a propósito y no unificadas por rubro: el desvío de CÓMPUTO se
 * puede atribuir a un rubro (la pared es de Mampostería), pero el de MATERIAL
 * no. En obra se hace un pastón y se reparte entre varias paredes, así que el
 * consumo real se carga por certificación y no por ítem. Repartirlo por rubro
 * sería inventar un dato que nadie midió. */

function colorPlata(monto: number): string {
  if (monto > 0) return ROJO;
  if (monto < 0) return VERDE;
  return TEXTO_2;
}

function Th({ children, alDerecha = false }: { children: React.ReactNode; alDerecha?: boolean }) {
  return (
    <th
      className={`text-[13px] font-semibold py-2 px-2 ${alDerecha ? 'text-right' : 'text-left'}`}
      style={{ color: TEXTO_2, borderBottom: BORDE_SUTIL }}
    >
      {children}
    </th>
  );
}

export function TablaRubros({ rubros }: { rubros: ControlRubro[] }) {
  const totalCertificado = rubros.reduce((s, r) => s + r.certificado_monto, 0);
  const totalDesvio = rubros.reduce((s, r) => s + r.desvio_computo_monto, 0);

  return (
    <section style={GLASS_CARD} className="p-5">
      <h3 className="text-base font-semibold mb-1" style={{ color: TEXTO }}>
        Por rubro
      </h3>
      <p className="text-xs mb-4" style={{ color: TEXTO_3 }}>
        Cuánto se ejecutó de cada rubro y cuánto corrió su alcance respecto del cómputo. En m² y
        m³ los rubros no se pueden sumar; en pesos sí, y por eso este corte vive acá.
      </p>

      {rubros.length === 0 ? (
        <p className="text-sm" style={{ color: TEXTO_2 }}>
          Todavía no hay nada certificado en esta obra.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px]">
            <thead>
              <tr>
                <Th>Rubro</Th>
                <Th alDerecha>Ítems</Th>
                <Th alDerecha>Certificado</Th>
                <Th alDerecha>Desvío de cómputo</Th>
                <Th alDerecha>%</Th>
              </tr>
            </thead>
            <tbody>
              {rubros.map((rubro) => (
                <tr key={rubro.rubro_id}>
                  <td className="text-sm py-2 px-2" style={{ color: TEXTO, borderBottom: BORDE_FILA }}>
                    {rubro.rubro_nombre}
                  </td>
                  <td
                    className="text-sm py-2 px-2 text-right tabular-nums"
                    style={{ color: TEXTO_3, borderBottom: BORDE_FILA }}
                  >
                    {rubro.items_certificados}
                  </td>
                  <td
                    className="text-sm py-2 px-2 text-right tabular-nums"
                    style={{ color: TEXTO, borderBottom: BORDE_FILA }}
                  >
                    {formatPrecio(rubro.certificado_monto)}
                  </td>
                  <td
                    className="text-sm py-2 px-2 text-right tabular-nums font-medium"
                    style={{ color: colorPlata(rubro.desvio_computo_monto), borderBottom: BORDE_FILA }}
                  >
                    {rubro.desvio_computo_monto === 0
                      ? '—'
                      : formatDesvioPrecio(rubro.desvio_computo_monto)}
                  </td>
                  <td
                    className="text-sm py-2 px-2 text-right tabular-nums font-medium"
                    style={{ color: colorPlata(rubro.desvio_computo_monto), borderBottom: BORDE_FILA }}
                  >
                    {rubro.desvio_computo_pct === null || rubro.desvio_computo_monto === 0 ? (
                      <span style={{ color: TEXTO_3 }}>—</span>
                    ) : (
                      formatPct(rubro.desvio_computo_pct)
                    )}
                  </td>
                </tr>
              ))}
              <tr>
                <td className="text-sm py-2 px-2 font-semibold" style={{ color: TEXTO }} colSpan={2}>
                  Total
                </td>
                <td className="text-sm py-2 px-2 text-right tabular-nums font-bold" style={{ color: TEXTO }}>
                  {formatPrecio(totalCertificado)}
                </td>
                <td
                  className="text-sm py-2 px-2 text-right tabular-nums font-bold"
                  style={{ color: colorPlata(totalDesvio) }}
                >
                  {totalDesvio === 0 ? '—' : formatDesvioPrecio(totalDesvio)}
                </td>
                <td />
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export function TablaMateriales({ materiales }: { materiales: ControlMaterial[] }) {
  const totalMaterial = materiales.reduce((s, m) => s + m.desvio_material_monto, 0);
  const totalPrecio = materiales.reduce((s, m) => s + m.desvio_precio_monto, 0);

  return (
    <section style={GLASS_CARD} className="p-5">
      <h3 className="text-base font-semibold mb-1" style={{ color: TEXTO }}>
        Por material
      </h3>
      <p className="text-xs mb-4" style={{ color: TEXTO_3 }}>
        Las dos mitades del desvío de cada material: cuánto se usó de más o de menos, y cuánto se
        pagó de más o de menos por lo que se usó.
      </p>

      {materiales.length === 0 ? (
        <p className="text-sm" style={{ color: TEXTO_2 }}>
          Todavía no hay consumo de materiales cargado.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px]">
            <thead>
              <tr>
                <Th>Material</Th>
                <Th alDerecha>Previsto</Th>
                <Th alDerecha>Consumido</Th>
                <Th alDerecha>Desvío de consumo</Th>
                <Th alDerecha>Precio presup.</Th>
                <Th alDerecha>Precio pagado</Th>
                <Th alDerecha>Desvío de precio</Th>
              </tr>
            </thead>
            <tbody>
              {materiales.map((material) => {
                /* Todo llega en unidad base; se muestra en unidad de compra
                 * cuando hay factor, que es como el encargado lo piensa. */
                const { unidad, factor, convertido } = unidadDeCarga(material);
                const precioLista = material.precio_unitario * factor;
                const precioReal =
                  material.precio_real === null ? null : material.precio_real * factor;

                return (
                  <tr key={material.insumo_id}>
                    <td className="text-sm py-2 px-2" style={{ color: TEXTO, borderBottom: BORDE_FILA }}>
                      {material.nombre}
                      <span className="block text-[11px]" style={{ color: TEXTO_3 }}>
                        {pluralizar(2, unidad)}
                        {convertido && ` de ${material.unidad_medida}`}
                      </span>
                    </td>
                    <td
                      className="text-sm py-2 px-2 text-right tabular-nums"
                      style={{ color: TEXTO_2, borderBottom: BORDE_FILA }}
                    >
                      {formatNum(material.previsto / factor, unidad)}
                    </td>
                    <td
                      className="text-sm py-2 px-2 text-right tabular-nums"
                      style={{ color: TEXTO, borderBottom: BORDE_FILA }}
                    >
                      {formatNum(material.consumido / factor, unidad)}
                    </td>
                    <td
                      className="text-sm py-2 px-2 text-right tabular-nums font-medium"
                      style={{
                        color: colorPlata(material.desvio_material_monto),
                        borderBottom: BORDE_FILA,
                      }}
                    >
                      {formatDesvioPrecio(material.desvio_material_monto)}
                    </td>
                    <td
                      className="text-sm py-2 px-2 text-right tabular-nums"
                      style={{ color: TEXTO_2, borderBottom: BORDE_FILA }}
                    >
                      {formatPrecio(precioLista)}
                    </td>
                    <td
                      className="text-sm py-2 px-2 text-right tabular-nums"
                      style={{ color: TEXTO, borderBottom: BORDE_FILA }}
                    >
                      {precioReal === null ? (
                        <span style={{ color: TEXTO_3 }}>sin compras</span>
                      ) : (
                        formatPrecio(precioReal)
                      )}
                    </td>
                    <td
                      className="text-sm py-2 px-2 text-right tabular-nums font-medium"
                      style={{
                        color: colorPlata(material.desvio_precio_monto),
                        borderBottom: BORDE_FILA,
                      }}
                    >
                      {material.precio_real === null ? (
                        <span style={{ color: TEXTO_3 }}>—</span>
                      ) : (
                        formatDesvioPrecio(material.desvio_precio_monto)
                      )}
                    </td>
                  </tr>
                );
              })}
              <tr>
                <td className="text-sm py-2 px-2 font-semibold" style={{ color: TEXTO }} colSpan={3}>
                  Total
                </td>
                <td
                  className="text-sm py-2 px-2 text-right tabular-nums font-bold"
                  style={{ color: colorPlata(totalMaterial) }}
                >
                  {formatDesvioPrecio(totalMaterial)}
                </td>
                <td colSpan={2} />
                <td
                  className="text-sm py-2 px-2 text-right tabular-nums font-bold"
                  style={{ color: colorPlata(totalPrecio) }}
                >
                  {formatDesvioPrecio(totalPrecio)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
