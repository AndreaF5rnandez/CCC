'use client';

import { useCallback, useMemo, useState } from 'react';
import { useCompras, type DatosCompra } from '@/hooks/useCompras';
import { useConversionesCompra } from '@/hooks/useConversionesCompra';
import { useInsumos } from '@/hooks/useInsumos';
import { MensajeError, MensajeExito } from '@/components/ui/Mensajes';
import {
  ACENTO,
  ACENTO_TEXTO,
  AMBAR,
  AMBAR_FONDO,
  BORDE_FILA,
  BORDE_SUTIL,
  GLASS_CARD,
  GRIS_FONDO,
  INPUT,
  ROJO,
  ROJO_FONDO,
  TEXTO,
  TEXTO_2,
  TEXTO_3,
  VERDE,
  VERDE_FONDO,
} from '@/components/ui/estiloPragma';
import {
  formatDesvio,
  formatDesvioPrecio,
  formatFecha,
  formatNum,
  formatPct,
  formatPrecio,
  hoyISO,
  parsearCantidad,
  pluralizar,
  unidadDeCarga,
} from '@/lib/formato';
import type {
  CompraConDesvio,
  CompraConsolidadaInsumo,
  Insumo,
  InsumoCompraObraResponse,
} from '@/types';

/* ─── Severidad del desvío de precio ───────────────────────────────────────── */

/* Banda de tolerancia, solo de presentación: pagar 0,5% de más no es un desvío,
 * es el redondeo de la factura. No cambia ningún número, solo el color. */
const TOLERANCIA_PCT = 1;

type Severidad = 'de_mas' | 'de_menos' | 'en_linea' | 'sin_previsto';

/** Un insumo sin precio presupuestado no tiene contra qué compararse: no es un
 *  desvío de 0 ni de infinito, es una comparación que no se puede hacer. */
function clasificar(fila: { desvio_pct: number | null; desvio_precio: number }): Severidad {
  if (fila.desvio_pct === null) return 'sin_previsto';
  if (Math.abs(fila.desvio_pct) <= TOLERANCIA_PCT) return 'en_linea';
  return fila.desvio_precio > 0 ? 'de_mas' : 'de_menos';
}

const COLOR: Record<Severidad, { texto: string; fondo: string; etiqueta: string }> = {
  de_mas: { texto: ROJO, fondo: ROJO_FONDO, etiqueta: 'pagado de más' },
  de_menos: { texto: VERDE, fondo: VERDE_FONDO, etiqueta: 'pagado de menos' },
  /* Dentro de tolerancia va GRIS, no verde: el verde queda reservado para lo
     que sí es buena noticia (se pagó menos). Mismo criterio que el desvío de
     material y el de cómputo, en components/obras/certificacion/severidad.tsx. */
  en_linea: { texto: TEXTO_2, fondo: GRIS_FONDO, etiqueta: 'en línea' },
  sin_previsto: { texto: AMBAR, fondo: AMBAR_FONDO, etiqueta: 'sin precio presupuestado' },
};

/* ─── Conversión del insumo elegido en el formulario ───────────────────────── */

/** Cómo se compra un insumo en ESTA obra y a qué precio debería salir.
 *
 *  El factor viene resuelto del backend (`/api/insumo-compra-obra`, override de
 *  la obra sobre referencia del insumo): acá solo se lee. Es el mismo factor con
 *  el que el backend calcula el desvío, así que la ayuda que se muestra mientras
 *  se carga coincide con el previsto que después aparece en la tabla. */
function compraDelInsumo(
  insumo: Insumo,
  conversion: InsumoCompraObraResponse | undefined,
) {
  const { unidad, factor, convertido } = unidadDeCarga({
    unidad_medida: insumo.unidad_medida,
    unidad_compra: conversion?.unidad_compra ?? null,
    factor_compra: conversion?.factor_compra ?? null,
  });
  return {
    unidad,
    factor,
    convertido,
    // Sin conversión el factor es 1: el precio base ya está en unidad de compra.
    previsto: Number(insumo.precio_unitario) * factor,
  };
}

/* ─── Editor de compra (alta y edición) ────────────────────────────────────── */

/* El mismo componente sirve para cargar una compra nueva y para corregir una
 * existente: los campos y las validaciones son idénticos, y tenerlos dos veces
 * garantizaba que se desincronizaran. */

interface ValoresEditor {
  insumo_id: string;
  fecha: string;
  cantidad: string;
  precio: string;
  proveedor: string;
}

const EDITOR_VACIO = (): ValoresEditor => ({
  insumo_id: '',
  fecha: hoyISO(),
  cantidad: '',
  precio: '',
  proveedor: '',
});

function Etiqueta({ children }: { children: React.ReactNode }) {
  return (
    <label
      className="block text-[11px] font-semibold uppercase tracking-wide mb-1"
      style={{ color: TEXTO_3 }}
    >
      {children}
    </label>
  );
}

function EditorCompra({
  materiales,
  conversiones,
  inicial,
  textoGuardar,
  onGuardar,
  onCancelar,
}: {
  materiales: Insumo[];
  conversiones: Map<string, InsumoCompraObraResponse>;
  inicial: ValoresEditor;
  textoGuardar: string;
  onGuardar: (datos: DatosCompra) => Promise<void>;
  onCancelar?: () => void;
}) {
  const [valores, setValores] = useState<ValoresEditor>(inicial);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exito, setExito] = useState<string | null>(null);

  const campo = useCallback(
    <K extends keyof ValoresEditor>(clave: K, valor: ValoresEditor[K]) => {
      setValores((prev) => ({ ...prev, [clave]: valor }));
      setExito(null);
    },
    [],
  );

  /* El material elegido junto con su conversión: van juntos en un solo memo para
   * que la ayuda de abajo no tenga que asumir que uno existe si existe el otro. */
  const compra = useMemo(() => {
    const insumo = materiales.find((m) => m.id === valores.insumo_id);
    if (!insumo) return null;
    return { insumo, ...compraDelInsumo(insumo, conversiones.get(insumo.id)) };
  }, [materiales, valores.insumo_id, conversiones]);

  const guardar = useCallback(async () => {
    setError(null);
    setExito(null);

    if (!valores.insumo_id) {
      setError('Elegí el material que compraste.');
      return;
    }
    if (!valores.fecha) {
      setError('Poné la fecha de la compra.');
      return;
    }

    const cantidad = parsearCantidad(valores.cantidad);
    if (cantidad === null) {
      setError('La cantidad tiene que ser un número mayor o igual a 0.');
      return;
    }

    const precio = parsearCantidad(valores.precio);
    if (precio === null) {
      setError('El precio pagado tiene que ser un número mayor o igual a 0.');
      return;
    }

    setGuardando(true);
    try {
      await onGuardar({
        insumo_id: valores.insumo_id,
        fecha: valores.fecha,
        cantidad,
        precio_unitario_compra: precio,
        proveedor: valores.proveedor.trim() === '' ? null : valores.proveedor.trim(),
      });
      // En el alta se limpia para cargar la siguiente; en la edición el editor
      // se desmonta y este estado no llega a verse.
      setValores({ ...EDITOR_VACIO(), fecha: valores.fecha });
      setExito('Compra registrada.');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setGuardando(false);
    }
  }, [valores, onGuardar]);

  const unidadCantidad = compra ? pluralizar(2, compra.unidad) : 'unidades';
  const unidadPrecio = compra ? compra.unidad : 'unidad';

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 md:grid-cols-12 gap-3">
        <div className="col-span-2 md:col-span-2">
          <Etiqueta>Fecha</Etiqueta>
          <input
            type="date"
            value={valores.fecha}
            onChange={(e) => campo('fecha', e.target.value)}
            style={INPUT}
            className="w-full"
          />
        </div>

        <div className="col-span-2 md:col-span-4">
          <Etiqueta>Material</Etiqueta>
          <select
            value={valores.insumo_id}
            onChange={(e) => campo('insumo_id', e.target.value)}
            style={INPUT}
            className="w-full"
          >
            <option value="">Elegir material…</option>
            {materiales.map((m) => (
              <option key={m.id} value={m.id}>
                {m.nombre}
              </option>
            ))}
          </select>
        </div>

        <div className="col-span-1 md:col-span-2">
          {/* La unidad va en la etiqueta, no en un cartel aparte: es el dato que
              define qué número se escribe acá. */}
          <Etiqueta>Cantidad ({unidadCantidad})</Etiqueta>
          <input
            type="text"
            inputMode="decimal"
            value={valores.cantidad}
            onChange={(e) => campo('cantidad', e.target.value)}
            placeholder="50"
            style={INPUT}
            className="w-full"
          />
        </div>

        <div className="col-span-1 md:col-span-2">
          <Etiqueta>Precio por {unidadPrecio}</Etiqueta>
          <input
            type="text"
            inputMode="decimal"
            value={valores.precio}
            onChange={(e) => campo('precio', e.target.value)}
            placeholder="170"
            style={INPUT}
            className="w-full"
          />
        </div>

        <div className="col-span-2 md:col-span-2">
          <Etiqueta>Proveedor</Etiqueta>
          <input
            type="text"
            value={valores.proveedor}
            onChange={(e) => campo('proveedor', e.target.value)}
            placeholder="Opcional"
            style={INPUT}
            className="w-full"
          />
        </div>
      </div>

      {/* Contra qué se va a comparar lo que se está cargando */}
      <div className="text-xs" style={{ color: TEXTO_2 }}>
        {compra === null ? (
          <span style={{ color: TEXTO_3 }}>
            Elegí un material para ver el precio previsto.
          </span>
        ) : (
          <>
            Se compra en{' '}
            <span className="font-semibold" style={{ color: TEXTO }}>
              {pluralizar(2, compra.unidad)}
            </span>
            {compra.convertido && (
              <>
                {' '}de {formatNum(compra.factor, compra.insumo.unidad_medida)}{' '}
                {compra.insumo.unidad_medida}
              </>
            )}
            {' · previsto '}
            <span className="font-semibold" style={{ color: TEXTO }}>
              {formatPrecio(compra.previsto)}
            </span>{' '}
            por {compra.unidad}
            {compra.previsto <= 0 && (
              <span className="ml-2" style={{ color: AMBAR }}>
                (el material no tiene precio presupuestado: no se va a poder calcular el
                desvío)
              </span>
            )}
          </>
        )}
      </div>

      {error && <MensajeError>{error}</MensajeError>}
      {exito && <MensajeExito>{exito}</MensajeExito>}

      <div className="flex items-center gap-2">
        <button
          onClick={guardar}
          disabled={guardando}
          className="text-sm font-semibold px-6 py-2.5 rounded-full disabled:opacity-40 transition-colors"
          style={{ background: ACENTO, color: ACENTO_TEXTO }}
        >
          {guardando ? 'Guardando…' : textoGuardar}
        </button>
        {onCancelar && (
          <button
            onClick={onCancelar}
            disabled={guardando}
            className="text-sm font-medium px-5 py-2.5 rounded-full disabled:opacity-40 transition-colors hover:bg-black/[0.04]"
            style={{ color: TEXTO_2 }}
          >
            Cancelar
          </button>
        )}
      </div>
    </div>
  );
}

/* ─── Zona A: registro de compras ──────────────────────────────────────────── */

function FilaCompra({
  compra,
  onEditar,
  onEliminar,
}: {
  compra: CompraConDesvio;
  onEditar: () => void;
  onEliminar: (id: string) => Promise<void>;
}) {
  const [confirmando, setConfirmando] = useState(false);
  const [borrando, setBorrando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const borrar = useCallback(async () => {
    setError(null);
    setBorrando(true);
    try {
      await onEliminar(compra.id);
      // La fila se desmonta al salir de la lista: no hay nada que limpiar.
    } catch (err) {
      setError((err as Error).message);
      setBorrando(false);
      setConfirmando(false);
    }
  }, [onEliminar, compra.id]);

  const sev = clasificar(compra);
  const color = COLOR[sev];
  // Todo llega del backend ya en unidad de compra: acá no se convierte nada.
  const { unidad } = unidadDeCarga(compra);

  return (
    <>
      <tr>
        <td className="text-sm py-2.5 px-2 whitespace-nowrap" style={{ color: TEXTO_2, borderBottom: BORDE_FILA }}>
          {formatFecha(compra.fecha)}
        </td>
        <td className="text-sm py-2.5 px-2" style={{ color: TEXTO, borderBottom: BORDE_FILA }}>
          {compra.nombre}
        </td>
        <td className="text-sm py-2.5 px-2 text-right tabular-nums whitespace-nowrap" style={{ color: TEXTO, borderBottom: BORDE_FILA }}>
          {formatNum(compra.cantidad, unidad)}{' '}
          <span style={{ color: TEXTO_3 }}>{pluralizar(compra.cantidad, unidad)}</span>
        </td>
        <td className="text-sm py-2.5 px-2" style={{ color: TEXTO_2, borderBottom: BORDE_FILA }}>
          {compra.proveedor ?? <span style={{ color: TEXTO_3 }}>—</span>}
        </td>
        <td className="text-sm py-2.5 px-2 text-right tabular-nums" style={{ color: TEXTO, borderBottom: BORDE_FILA }}>
          {formatPrecio(compra.precio_unitario_compra)}
        </td>
        <td className="text-sm py-2.5 px-2 text-right tabular-nums" style={{ color: TEXTO_2, borderBottom: BORDE_FILA }}>
          {compra.precio_previsto_compra > 0 ? (
            formatPrecio(compra.precio_previsto_compra)
          ) : (
            <span style={{ color: TEXTO_3 }}>sin precio</span>
          )}
        </td>
        <td className="text-sm py-2.5 px-2 text-right tabular-nums font-medium" style={{ color: color.texto, borderBottom: BORDE_FILA }}>
          {sev === 'sin_previsto' ? (
            <span style={{ color: TEXTO_3 }}>n/a</span>
          ) : (
            formatDesvioPrecio(compra.desvio_precio)
          )}
        </td>
        <td className="text-sm py-2.5 px-2 text-right tabular-nums font-medium" style={{ color: color.texto, borderBottom: BORDE_FILA }}>
          {/* Sin precio presupuestado no hay porcentaje posible. */}
          {compra.desvio_pct === null ? (
            <span style={{ color: TEXTO_3 }}>n/a</span>
          ) : (
            formatPct(compra.desvio_pct)
          )}
        </td>
        <td className="py-2.5 px-2 text-right whitespace-nowrap" style={{ borderBottom: BORDE_FILA }}>
          {confirmando ? (
            <span className="flex items-center gap-2 justify-end">
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
                className="text-xs font-medium px-2 py-1 rounded-full disabled:opacity-40"
                style={{ color: TEXTO_2 }}
              >
                No
              </button>
            </span>
          ) : (
            <span className="flex items-center gap-1 justify-end">
              <button
                onClick={onEditar}
                className="text-xs font-medium px-3 py-1 rounded-full transition-colors hover:bg-black/[0.04]"
                style={{ color: TEXTO_2 }}
              >
                Editar
              </button>
              <button
                onClick={() => setConfirmando(true)}
                className="text-xs font-medium px-3 py-1 rounded-full transition-colors hover:bg-black/[0.04]"
                style={{ color: TEXTO_3 }}
              >
                Borrar
              </button>
            </span>
          )}
        </td>
      </tr>

      {error && (
        <tr>
          <td colSpan={9} className="px-2 pb-2">
            <MensajeError>{error}</MensajeError>
          </td>
        </tr>
      )}
    </>
  );
}

const COLUMNAS_COMPRAS = [
  { titulo: 'Fecha', derecha: false },
  { titulo: 'Material', derecha: false },
  { titulo: 'Cantidad', derecha: true },
  { titulo: 'Proveedor', derecha: false },
  { titulo: 'Pagado', derecha: true },
  { titulo: 'Previsto', derecha: true },
  { titulo: 'Desvío', derecha: true },
  { titulo: '%', derecha: true },
  { titulo: '', derecha: true },
];

function BloqueRegistro({
  compras,
  materiales,
  conversiones,
  crearCompra,
  actualizarCompra,
  eliminarCompra,
}: {
  compras: CompraConDesvio[];
  materiales: Insumo[];
  conversiones: Map<string, InsumoCompraObraResponse>;
  crearCompra: (datos: DatosCompra) => Promise<void>;
  actualizarCompra: (id: string, datos: DatosCompra) => Promise<void>;
  eliminarCompra: (id: string) => Promise<void>;
}) {
  const [editando, setEditando] = useState<string | null>(null);

  // Más reciente primero: el endpoint las manda en orden cronológico y acá
  // interesa lo último comprado, igual que en el histórico de certificaciones.
  const ordenadas = useMemo(() => compras.slice().reverse(), [compras]);

  return (
    <section className="flex flex-col gap-4">
      {/* ── Alta ── */}
      <div style={GLASS_CARD} className="p-5">
        <h3 className="text-[15px] font-semibold mb-1" style={{ color: TEXTO }}>
          Registrar una compra
        </h3>
        <p className="text-xs mb-4" style={{ color: TEXTO_2 }}>
          La cantidad y el precio se cargan en unidad de compra: bolsas, barras, rollos.
        </p>
        <EditorCompra
          materiales={materiales}
          conversiones={conversiones}
          inicial={EDITOR_VACIO()}
          textoGuardar="Registrar compra"
          onGuardar={crearCompra}
        />
      </div>

      {/* ── Listado ── */}
      <div style={GLASS_CARD} className="p-5">
        <h3 className="text-[15px] font-semibold mb-3" style={{ color: TEXTO }}>
          Compras registradas
          {compras.length > 0 && (
            <span className="ml-2 text-xs font-normal" style={{ color: TEXTO_3 }}>
              {compras.length}
            </span>
          )}
        </h3>

        {ordenadas.length === 0 ? (
          <div className="py-8 text-center">
            <p className="text-sm" style={{ color: TEXTO_2 }}>
              Todavía no registraste compras en esta obra.
            </p>
            <p className="text-sm mt-1" style={{ color: TEXTO_3 }}>
              Cargá la primera con el formulario de arriba.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px]">
              <thead>
                <tr>
                  {COLUMNAS_COMPRAS.map((c, i) => (
                    <th
                      key={c.titulo === '' ? `acciones-${i}` : c.titulo}
                      className={`text-[13px] font-semibold py-2 px-2 ${
                        c.derecha ? 'text-right' : 'text-left'
                      }`}
                      style={{ color: TEXTO_2, borderBottom: BORDE_SUTIL }}
                    >
                      {c.titulo}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ordenadas.map((compra) =>
                  editando === compra.id ? (
                    <tr key={compra.id}>
                      <td colSpan={COLUMNAS_COMPRAS.length} className="py-3 px-2" style={{ borderBottom: BORDE_FILA }}>
                        <p
                          className="text-[11px] font-semibold uppercase tracking-wide mb-2"
                          style={{ color: TEXTO_3 }}
                        >
                          Editando la compra del {formatFecha(compra.fecha)}
                        </p>
                        <EditorCompra
                          materiales={materiales}
                          conversiones={conversiones}
                          inicial={{
                            insumo_id: compra.insumo_id,
                            fecha: compra.fecha.slice(0, 10),
                            cantidad: String(compra.cantidad),
                            precio: String(compra.precio_unitario_compra),
                            proveedor: compra.proveedor ?? '',
                          }}
                          textoGuardar="Guardar cambios"
                          onGuardar={async (datos) => {
                            await actualizarCompra(compra.id, datos);
                            setEditando(null);
                          }}
                          onCancelar={() => setEditando(null)}
                        />
                      </td>
                    </tr>
                  ) : (
                    <FilaCompra
                      key={compra.id}
                      compra={compra}
                      onEditar={() => setEditando(compra.id)}
                      onEliminar={eliminarCompra}
                    />
                  ),
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}

/* ─── Zona B: desvío de precio consolidado ─────────────────────────────────── */

function Tarjeta({
  etiqueta,
  valor,
  detalle,
  fondoIcono,
  colorIcono,
  glifo,
  colorValor,
}: {
  etiqueta: string;
  valor: string;
  detalle: string;
  fondoIcono: string;
  colorIcono: string;
  glifo: string;
  colorValor?: string;
}) {
  return (
    <div style={GLASS_CARD} className="p-5 flex flex-col gap-2">
      <div
        className="w-11 h-11 rounded-xl flex items-center justify-center text-lg font-bold"
        style={{ background: fondoIcono, color: colorIcono }}
      >
        {glifo}
      </div>
      <span className="text-2xl font-bold tabular-nums" style={{ color: colorValor ?? TEXTO }}>
        {valor}
      </span>
      <span className="text-sm" style={{ color: TEXTO_2 }}>
        {etiqueta}
      </span>
      <span className="text-xs" style={{ color: TEXTO_3 }}>
        {detalle}
      </span>
    </div>
  );
}

function BloqueConsolidado({ consolidado }: { consolidado: CompraConsolidadaInsumo[] }) {
  const resumen = useMemo(() => {
    let gastoTotal = 0;
    let desvioTotal = 0;
    let deMas = 0;
    let sinPrevisto = 0;

    for (const fila of consolidado) {
      gastoTotal += fila.gasto_total;
      if (fila.desvio_pct === null) {
        /* Sin precio presupuestado, `desvio_gasto` es el gasto entero: sumarlo
         * diría que todo ese material se pagó de más, que es falso. Queda fuera
         * del total y se avisa aparte cuántos son. */
        sinPrevisto++;
        continue;
      }
      desvioTotal += fila.desvio_gasto;
      if (clasificar(fila) === 'de_mas') deMas++;
    }

    return { gastoTotal, desvioTotal, deMas, sinPrevisto, comparables: consolidado.length - sinPrevisto };
  }, [consolidado]);

  if (consolidado.length === 0) {
    return (
      <section style={GLASS_CARD} className="p-8 text-center">
        <p className="text-sm" style={{ color: TEXTO_2 }}>
          El desvío de precio aparece acá cuando registres la primera compra.
        </p>
      </section>
    );
  }

  const seGastoDeMas = resumen.desvioTotal > 0;

  return (
    <section className="flex flex-col gap-4">
      {/* ── Lectura de un vistazo ── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Tarjeta
          glifo="$"
          fondoIcono="#FFF3D0"
          colorIcono="#F5A623"
          valor={formatPrecio(resumen.gastoTotal)}
          etiqueta="Gasto real en materiales"
          detalle={`${consolidado.length} ${consolidado.length === 1 ? 'material comprado' : 'materiales comprados'}`}
        />
        <Tarjeta
          glifo="Δ"
          fondoIcono={seGastoDeMas ? ROJO_FONDO : VERDE_FONDO}
          colorIcono={seGastoDeMas ? ROJO : VERDE}
          valor={formatDesvioPrecio(resumen.desvioTotal)}
          colorValor={seGastoDeMas ? ROJO : VERDE}
          etiqueta={seGastoDeMas ? 'Gastado de más por precio' : 'Ahorrado por precio'}
          detalle={
            resumen.sinPrevisto > 0
              ? `Sobre ${resumen.comparables} de ${consolidado.length} materiales: el resto no tiene precio presupuestado`
              : 'Contra el precio presupuestado, a igual cantidad'
          }
        />
        <Tarjeta
          glifo="!"
          fondoIcono={resumen.deMas > 0 ? ROJO_FONDO : '#D5F5F0'}
          colorIcono={resumen.deMas > 0 ? ROJO : '#14B8A6'}
          valor={String(resumen.deMas)}
          colorValor={resumen.deMas > 0 ? ROJO : TEXTO}
          etiqueta={
            resumen.deMas === 1 ? 'Material por encima del previsto' : 'Materiales por encima del previsto'
          }
          detalle={`Desvío mayor a ${TOLERANCIA_PCT}%`}
        />
      </div>

      {/* ── Tabla por insumo ── */}
      <div style={GLASS_CARD} className="p-5">
        <h3 className="text-[15px] font-semibold mb-1" style={{ color: TEXTO }}>
          Desvío de precio por material
        </h3>
        <p className="text-xs mb-3" style={{ color: TEXTO_2 }}>
          El precio real es el promedio ponderado por cantidad: una compra grande pesa más
          que una chica.
        </p>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px]">
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
                {['Previsto', 'Real ponderado', '%', 'Comprado', 'Gasto real', 'Desvío'].map((h) => (
                  <th
                    key={h}
                    className="text-right text-[13px] font-semibold py-2 px-2"
                    style={{ color: TEXTO_2, borderBottom: BORDE_SUTIL }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {consolidado.map((fila) => {
                const sev = clasificar(fila);
                const color = COLOR[sev];
                // Ya viene todo en unidad de compra: no se divide por el factor.
                const { unidad, convertido } = unidadDeCarga(fila);
                return (
                  <tr key={fila.insumo_id}>
                    <td className="text-sm py-2.5 px-2" style={{ color: TEXTO, borderBottom: BORDE_FILA }}>
                      {fila.nombre}
                      {sev === 'sin_previsto' && (
                        <span
                          className="ml-2 text-[11px] px-2 py-0.5 rounded-full whitespace-nowrap"
                          style={{ background: color.fondo, color: color.texto }}
                        >
                          {color.etiqueta}
                        </span>
                      )}
                    </td>
                    <td className="text-sm py-2.5 px-2" style={{ color: TEXTO_3, borderBottom: BORDE_FILA }}>
                      {pluralizar(2, unidad)}
                      {convertido && (
                        <span className="block text-[11px]" style={{ color: TEXTO_3 }}>
                          de {formatNum(fila.factor_compra ?? 1, fila.unidad_medida)}{' '}
                          {fila.unidad_medida}
                        </span>
                      )}
                    </td>
                    <td className="text-sm py-2.5 px-2 text-right tabular-nums" style={{ color: TEXTO_2, borderBottom: BORDE_FILA }}>
                      {fila.precio_previsto_compra > 0 ? (
                        formatPrecio(fila.precio_previsto_compra)
                      ) : (
                        <span style={{ color: TEXTO_3 }}>—</span>
                      )}
                    </td>
                    <td className="text-sm py-2.5 px-2 text-right tabular-nums font-medium" style={{ color: TEXTO, borderBottom: BORDE_FILA }}>
                      {formatPrecio(fila.precio_promedio_compra)}
                    </td>
                    <td className="text-sm py-2.5 px-2 text-right tabular-nums font-medium" style={{ color: color.texto, borderBottom: BORDE_FILA }}>
                      {fila.desvio_pct === null ? (
                        <span style={{ color: TEXTO_3 }}>n/a</span>
                      ) : (
                        formatPct(fila.desvio_pct)
                      )}
                    </td>
                    <td className="text-sm py-2.5 px-2 text-right tabular-nums" style={{ color: TEXTO_2, borderBottom: BORDE_FILA }}>
                      {formatNum(fila.cantidad_total, unidad)}{' '}
                      <span style={{ color: TEXTO_3 }}>{pluralizar(fila.cantidad_total, unidad)}</span>
                    </td>
                    <td className="text-sm py-2.5 px-2 text-right tabular-nums" style={{ color: TEXTO, borderBottom: BORDE_FILA }}>
                      {formatPrecio(fila.gasto_total)}
                    </td>
                    <td className="text-sm py-2.5 px-2 text-right tabular-nums font-semibold" style={{ color: color.texto, borderBottom: BORDE_FILA }}>
                      {sev === 'sin_previsto' ? (
                        <span style={{ color: TEXTO_3 }}>n/a</span>
                      ) : (
                        formatDesvioPrecio(fila.desvio_gasto)
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {resumen.sinPrevisto > 0 && (
          <p className="text-xs mt-3" style={{ color: TEXTO_3 }}>
            {resumen.sinPrevisto === 1
              ? '1 material no tiene precio presupuestado, así que no entra en el desvío.'
              : `${resumen.sinPrevisto} materiales no tienen precio presupuestado, así que no entran en el desvío.`}{' '}
            Cargales el precio unitario en Insumos para poder compararlos.
          </p>
        )}
      </div>
    </section>
  );
}

/* ─── Vista ────────────────────────────────────────────────────────────────── */

/**
 * Sub-solapa Compras: el registro de compras de la obra y el desvío de PRECIO.
 *
 * Dos zonas, en el orden en que se usan: arriba el registro (cargar y listar),
 * abajo el consolidado por material, que es la lectura de cierre de obra.
 */
export function VistaCompras({ obraId }: { obraId: string }) {
  const {
    compras,
    consolidado,
    cargando,
    error,
    crearCompra,
    actualizarCompra,
    eliminarCompra,
  } = useCompras(obraId);

  // Solo materiales: lo que se compra a proveedor. El listado, en cambio, muestra
  // todo lo que haya registrado, sin filtrar: son movimientos de plata.
  const { insumos: materiales, error: errorInsumos } = useInsumos('material');

  /* El factor de compra de la obra, ya resuelto por el backend (override sobre
   * referencia). Solo se usa para la ayuda del formulario: el desvío que se
   * muestra lo calcula el backend con este mismo factor. */
  const { conversiones } = useConversionesCompra(obraId);

  const ordenadosPorNombre = useMemo(
    () => materiales.slice().sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')),
    [materiales],
  );

  if (cargando) {
    return (
      <div className="flex items-center justify-center h-40">
        <p style={{ color: TEXTO_2 }}>Cargando compras…</p>
      </div>
    );
  }

  if (error) {
    return <MensajeError>{error}</MensajeError>;
  }

  return (
    <div className="flex flex-col gap-6">
      {errorInsumos && <MensajeError>{errorInsumos}</MensajeError>}

      <BloqueRegistro
        compras={compras}
        materiales={ordenadosPorNombre}
        conversiones={conversiones}
        crearCompra={crearCompra}
        actualizarCompra={actualizarCompra}
        eliminarCompra={eliminarCompra}
      />

      <div style={{ borderTop: BORDE_SUTIL }} className="pt-2">
        <h2 className="text-lg font-bold mb-1" style={{ color: TEXTO }}>
          Desvío de precio
        </h2>
        <p className="text-sm mb-4" style={{ color: TEXTO_2 }}>
          Lo que se pagó contra lo presupuestado, por material, al cierre de la obra.
        </p>
        <BloqueConsolidado consolidado={consolidado} />
      </div>
    </div>
  );
}

export default VistaCompras;
