'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ACENTO,
  ACENTO_TEXTO,
  BORDE_FILA,
  BORDE_SUTIL,
  GLASS_CARD,
  INPUT,
  TEXTO,
  TEXTO_2,
  TEXTO_3,
} from '@/components/ui/estiloPragma';
import {
  formatDesvio,
  formatFecha,
  formatNum,
  formatPct,
  hoyISO,
  parsearCantidad,
  pluralizar,
  unidadDeCarga,
} from '@/lib/formato';
import {
  CAMPOS_MEDIDA,
  ETIQUETA_CAMPO,
  campoInvalido,
  cantidadDeMedidas,
  difiereDelComputo,
  medidasDesdeComputo,
  medidasDesdeReal,
  medidasRealesDeItem,
  numeroATexto,
  type MedidasTexto,
} from '@/lib/certificacionMedidas';
import {
  SELECCION_VACIA,
  alternarItemEn,
  alternarMedicionEn,
  alternarRubroEn,
  cantidadEjecutada,
  certificadasDelItem,
  estadoDelItem,
  estadoDelRubro,
  itemCompletamenteCertificado,
  itemsEjecutados,
  type Disponibilidad,
  type EstadoTilde,
  type Seleccion,
} from '@/lib/certificacionSeleccion';
import { useInsumos } from '@/hooks/useInsumos';
import type { useCertificaciones } from '@/hooks/useCertificaciones';
import { AvisoError, Chip, clasificarComputo, esFuerte } from './severidad';
import type {
  CertificacionConDesvio,
  CertificacionInsumoPrevisto,
  CertificacionItemDisponible,
  CertificacionItemsResponse,
  CertificacionMedicion,
  CertificacionRubroDisponible,
  InsumoCompraObraResponse,
} from '@/types';

type CertificacionesHook = ReturnType<typeof useCertificaciones>;

/** Un material agregado a mano: lo mínimo para mostrar la fila y guardarlo. */
interface Extra {
  id: string;
  nombre: string;
  unidad_medida: string;
}

/* ─── Helpers de presentación ──────────────────────────────────────────────── */

/** Dimensiones de una medición como en el cómputo: 3 · 3,50 · 2,60. */
function dimensiones(m: CertificacionMedicion): string {
  const partes = [m.n, m.largo, m.ancho, m.alto]
    .filter((v): v is number => typeof v === 'number')
    .map((v) => new Intl.NumberFormat('es-AR', { maximumFractionDigits: 2 }).format(v));
  return partes.length > 1 ? partes.join(' · ') : '';
}

/** Checkbox de tres estados. El parcial no se puede poner por atributo: hay que
 *  escribir `indeterminate` sobre el nodo. */
function CheckTriestado({
  estado,
  onChange,
  className,
  disabled,
}: {
  estado: EstadoTilde;
  onChange: () => void;
  className?: string;
  disabled?: boolean;
}) {
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (ref.current) ref.current.indeterminate = estado === 'algunas';
  }, [estado]);

  return (
    <input
      ref={ref}
      type="checkbox"
      checked={estado === 'todas'}
      onChange={onChange}
      disabled={disabled}
      className={
        (className ?? 'w-4 h-4 shrink-0') +
        (disabled ? ' cursor-not-allowed' : ' cursor-pointer')
      }
      style={{ accentColor: ACENTO }}
    />
  );
}

/* ─── Estado inicial ───────────────────────────────────────────────────────── */

/** Todas las mediciones de la obra, indexadas: al editar hay que ir de un
 *  medicion_id guardado a la medición del cómputo. */
function indexarMediciones(datos: CertificacionItemsResponse) {
  const porItem = new Map<string, CertificacionItemDisponible>();
  for (const rubro of datos.rubros) {
    for (const item of rubro.items) porItem.set(item.item_id, item);
  }
  return porItem;
}

/**
 * Reconstruye el estado del formulario desde una certificación guardada.
 *
 * Editar tiene que arrancar exactamente donde quedó: las mismas mediciones
 * tildadas, las medidas reales que se hayan corregido y el material cargado.
 * Sin esto, editar sería volver a seleccionar todo desde cero.
 */
function estadoDesdeCertificacion(
  cert: CertificacionConDesvio,
  itemsPorId: Map<string, CertificacionItemDisponible>,
) {
  const mediciones = new Set<string>();
  const medidas: Record<string, MedidasTexto> = {};

  for (const fila of cert.desvio_computo.mediciones) {
    mediciones.add(fila.medicion_id);
    // Solo las corregidas tienen medida real guardada; el resto arranca con la
    // del cómputo, que es lo que el formulario muestra por defecto.
    if (fila.real) medidas[fila.medicion_id] = medidasDesdeReal(fila.real);
  }

  // Ítems sin mediciones cargadas: se certifican enteros, no aparecen arriba.
  const itemsSinMedicion = new Set(
    cert.items
      .filter((it) => (itemsPorId.get(it.item_id)?.mediciones.length ?? 0) === 0)
      .map((it) => it.item_id),
  );

  /* El material se guarda en unidad BASE y se edita en unidad de compra: se
   * divide por el mismo factor que usó la vista al guardarlo. El factor sale
   * del desvío, que ya viene resuelto por el backend. */
  const factores = new Map(cert.desvio.map((d) => [d.insumo_id, unidadDeCarga(d).factor]));
  const reales: Record<string, string> = {};
  for (const fila of cert.insumos_reales) {
    const factor = factores.get(fila.insumo_id) ?? 1;
    reales[fila.insumo_id] = numeroATexto(fila.cantidad_real / factor);
  }

  // Material consumido que no salía de ninguna receta: hay que volver a
  // mostrarlo como fila agregada a mano, si no desaparecería al editar.
  const previstos = new Set(cert.insumos_previstos.map((p) => p.insumo_id));
  const extras: Extra[] = cert.insumos_reales
    .filter((fila) => !previstos.has(fila.insumo_id))
    .map((fila) => ({
      id: fila.insumo_id,
      nombre: fila.nombre,
      unidad_medida: fila.unidad_medida,
    }));

  return {
    seleccion: { mediciones, itemsSinMedicion } as Seleccion,
    medidas,
    reales,
    extras,
    // Los ítems con algo tildado arrancan desplegados: si no, las medidas
    // reales quedarían escondidas detrás de un click.
    expandidos: new Set(
      cert.desvio_computo.mediciones.map((fila) => fila.item_id),
    ),
  };
}

/* ─── Formulario ───────────────────────────────────────────────────────────── */

export function FormularioCertificacion({
  datos,
  certificacion,
  conversiones,
  calcularPrevisto,
  crearCertificacion,
  actualizarCertificacion,
  recargarItems,
  onCancelar,
  onGuardado,
}: {
  datos: CertificacionItemsResponse;
  /** Presente = se está editando esa certificación; ausente = una nueva. */
  certificacion: CertificacionConDesvio | null;
  conversiones: Map<string, InsumoCompraObraResponse>;
  calcularPrevisto: CertificacionesHook['calcularPrevisto'];
  crearCertificacion: CertificacionesHook['crearCertificacion'];
  actualizarCertificacion: CertificacionesHook['actualizarCertificacion'];
  recargarItems: () => Promise<void>;
  onCancelar: () => void;
  onGuardado: (mensaje: string) => void;
}) {
  // Solo materiales: esta fase de certificación no carga mano de obra ni equipo.
  const { insumos: materiales } = useInsumos('material');

  const itemsPorId = useMemo(() => indexarMediciones(datos), [datos]);

  // El estado inicial se calcula una sola vez: después manda lo que el
  // encargado va tocando, no la certificación que se abrió.
  const inicial = useMemo(
    () => (certificacion ? estadoDesdeCertificacion(certificacion, itemsPorId) : null),
    [certificacion, itemsPorId],
  );

  const [fecha, setFecha] = useState(certificacion?.fecha.slice(0, 10) ?? hoyISO());
  const [descripcion, setDescripcion] = useState(certificacion?.descripcion ?? '');
  const [seleccion, setSeleccion] = useState<Seleccion>(inicial?.seleccion ?? SELECCION_VACIA);
  const [medidas, setMedidas] = useState<Record<string, MedidasTexto>>(inicial?.medidas ?? {});
  const [expandidos, setExpandidos] = useState<Set<string>>(inicial?.expandidos ?? new Set());
  // Mediciones reabiertas a mano en esta sesión de carga.
  const [reabiertas, setReabiertas] = useState<Set<string>>(new Set());

  const [previstos, setPrevistos] = useState<CertificacionInsumoPrevisto[]>([]);
  const [calculando, setCalculando] = useState(false);
  const [errorPrevisto, setErrorPrevisto] = useState<string | null>(null);

  // Cantidad real tipeada por insumo. Se guarda como texto para no pelear con
  // el cursor mientras se escribe; se parsea al guardar.
  const [reales, setReales] = useState<Record<string, string>>(inicial?.reales ?? {});
  // Insumos que el encargado sumó a mano porque las recetas no los contemplaban.
  const [extras, setExtras] = useState<Extra[]>(inicial?.extras ?? []);
  const [insumoAAgregar, setInsumoAAgregar] = useState('');

  const [guardando, setGuardando] = useState(false);
  const [errorGuardar, setErrorGuardar] = useState<string | null>(null);

  /* Qué se puede tildar: lo ya certificado queda afuera salvo que se reabra.
   * Al EDITAR, las mediciones de esta misma certificación no cuentan como
   * ajenas: son justamente las que hay que poder destildar. */
  const certificadasPorId = useMemo(() => {
    const ajenas = datos.certificadas.filter(
      (c) => c.certificacion_id !== certificacion?.id,
    );
    return new Map(ajenas.map((c) => [c.medicion_id, c]));
  }, [datos.certificadas, certificacion?.id]);

  const disponibilidad: Disponibilidad = useMemo(
    () => ({ certificadas: new Set(certificadasPorId.keys()), reabiertas }),
    [certificadasPorId, reabiertas],
  );

  /** Las medidas que muestra la pantalla: las tipeadas, o las del cómputo. */
  const medidasDe = useCallback(
    (m: CertificacionMedicion): MedidasTexto => medidas[m.id] ?? medidasDesdeComputo(m),
    [medidas],
  );

  /* Lo que se le manda al backend: por cada ítem con algo tildado, la suma de
   * las mediciones seleccionadas y, si alguna se corrigió, sus medidas reales.
   * El backend recalcula el previsto sobre la cantidad real; acá no se
   * recalcula nada. */
  const ejecutados = useMemo(() => {
    return itemsEjecutados(datos.rubros, seleccion, disponibilidad).map((pedido) => {
      const item = itemsPorId.get(pedido.item_id);
      if (!item) return pedido;
      const medidasReales = medidasRealesDeItem(
        item.mediciones,
        seleccion.mediciones,
        medidas,
      );
      return medidasReales.length > 0 ? { ...pedido, medidas_reales: medidasReales } : pedido;
    });
  }, [datos.rubros, seleccion, disponibilidad, itemsPorId, medidas]);

  const itemIds = useMemo(() => ejecutados.map((e) => e.item_id), [ejecutados]);

  /* Identidad estable de lo que entra al cálculo: cambia si cambia qué se
   * ejecutó o alguna medida real, no por una referencia de array nueva. */
  const clavePrevisto = useMemo(() => JSON.stringify(ejecutados), [ejecutados]);

  const totalMedicionesTildadas =
    seleccion.mediciones.size + seleccion.itemsSinMedicion.size;

  /* El previsto se recalcula cada vez que cambia la selección o una medida
   * real. Se espera un momento antes de pedirlo, porque tipear "3,50" son
   * cuatro cambios, y la request anterior se aborta para que dos cambios
   * rápidos no dejen pisado el resultado viejo sobre el nuevo. */
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    abortRef.current?.abort();

    const pedidos = JSON.parse(clavePrevisto) as typeof ejecutados;

    if (pedidos.length === 0) {
      setPrevistos([]);
      setErrorPrevisto(null);
      setCalculando(false);
      return;
    }

    const controller = new AbortController();
    abortRef.current = controller;
    setCalculando(true);
    setErrorPrevisto(null);

    const timer = setTimeout(() => {
      calcularPrevisto(pedidos, controller.signal)
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
    }, 300);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
    // clavePrevisto es la identidad estable de `ejecutados`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clavePrevisto, calcularPrevisto]);

  /* Al destildar una medición se olvida su corrección: dejarla escondida haría
   * que vuelva sola si el encargado la tilda de nuevo. */
  const podarMedidas = useCallback((siguiente: Seleccion) => {
    setMedidas((prev) => {
      const podadas: Record<string, MedidasTexto> = {};
      for (const [id, valor] of Object.entries(prev)) {
        if (siguiente.mediciones.has(id)) podadas[id] = valor;
      }
      return podadas;
    });
  }, []);

  const aplicar = useCallback(
    (siguiente: Seleccion) => {
      setSeleccion(siguiente);
      podarMedidas(siguiente);
    },
    [podarMedidas],
  );

  const alternarMedicion = useCallback(
    (medicionId: string) => aplicar(alternarMedicionEn(medicionId, seleccion)),
    [aplicar, seleccion],
  );

  /** El checkbox del ítem tilda o destilda sus mediciones DISPONIBLES. */
  const alternarItem = useCallback(
    (item: CertificacionItemDisponible) => {
      aplicar(alternarItemEn(item, seleccion, disponibilidad));
      // Si se acaba de tildar, se despliega: las medidas reales de sus
      // mediciones tienen que quedar a la vista, no detrás de otro click.
      if (estadoDelItem(item, seleccion, disponibilidad) !== 'todas') {
        setExpandidos((prev) => new Set(prev).add(item.item_id));
      }
    },
    [aplicar, seleccion, disponibilidad],
  );

  const alternarRubro = useCallback(
    (rubro: CertificacionRubroDisponible) => aplicar(alternarRubroEn(rubro, seleccion, disponibilidad)),
    [aplicar, seleccion, disponibilidad],
  );

  /** Reabrir es deliberado: devuelve la medición al conjunto tildable. */
  const reabrir = useCallback((medicionId: string) => {
    setReabiertas((prev) => new Set(prev).add(medicionId));
  }, []);

  const alternarExpandido = useCallback((itemId: string) => {
    setExpandidos((prev) => {
      const siguiente = new Set(prev);
      if (siguiente.has(itemId)) siguiente.delete(itemId);
      else siguiente.add(itemId);
      return siguiente;
    });
  }, []);

  const editarMedida = useCallback(
    (m: CertificacionMedicion, campo: keyof MedidasTexto, valor: string) => {
      setMedidas((prev) => ({
        ...prev,
        [m.id]: { ...(prev[m.id] ?? medidasDesdeComputo(m)), [campo]: valor },
      }));
    },
    [],
  );

  /** Vuelve una medición corregida a las medidas del cómputo. */
  const restaurarMedida = useCallback((medicionId: string) => {
    setMedidas((prev) => {
      const siguiente = { ...prev };
      delete siguiente[medicionId];
      return siguiente;
    });
  }, []);

  /* Filas de material a mostrar: las previstas más las agregadas a mano que no
   * estén ya previstas (si el encargado agrega una que sí estaba, se funde con
   * la fila prevista en vez de duplicarse). */
  const filasMaterial = useMemo(() => {
    const idsPrevistos = new Set(previstos.map((p) => p.insumo_id));
    // Los agregados a mano no salen de ninguna receta, así que su conversión no
    // viene en la respuesta del previsto: se busca en las de la obra.
    const filasExtra = extras
      .filter((e) => !idsPrevistos.has(e.id))
      .map((e) => {
        const conv = conversiones.get(e.id);
        return {
          insumo_id: e.id,
          nombre: e.nombre,
          unidad_medida: e.unidad_medida,
          unidad_compra: conv?.unidad_compra ?? null,
          factor_compra: conv?.factor_compra ?? null,
          cantidad_prevista: 0,
          esExtra: true,
        };
      });
    return [
      ...previstos.map((p) => ({
        insumo_id: p.insumo_id,
        nombre: p.nombre,
        unidad_medida: p.unidad_medida,
        unidad_compra: p.unidad_compra,
        factor_compra: p.factor_compra,
        cantidad_prevista: p.cantidad_prevista,
        esExtra: false,
      })),
      ...filasExtra,
    ];
  }, [previstos, extras, conversiones]);

  const materialesDisponibles = useMemo(() => {
    const yaEnPantalla = new Set(filasMaterial.map((f) => f.insumo_id));
    return materiales.filter((m) => !yaEnPantalla.has(m.id));
  }, [materiales, filasMaterial]);

  const agregarExtra = useCallback(() => {
    const insumo = materiales.find((m) => m.id === insumoAAgregar);
    if (!insumo) return;
    setExtras((prev) => [
      ...prev,
      { id: insumo.id, nombre: insumo.nombre, unidad_medida: insumo.unidad_medida },
    ]);
    setInsumoAAgregar('');
  }, [materiales, insumoAAgregar]);

  const guardar = useCallback(async () => {
    setErrorGuardar(null);

    if (ejecutados.length === 0) {
      setErrorGuardar('Tildá al menos una medición ejecutada.');
      return;
    }

    // Una medida a medio tipear no se manda en silencio: se nombra la pared y
    // el campo, que es lo que el encargado tiene que corregir.
    for (const rubro of datos.rubros) {
      for (const item of rubro.items) {
        for (const m of item.mediciones) {
          if (!seleccion.mediciones.has(m.id)) continue;
          const invalido = campoInvalido(medidasDe(m));
          if (invalido) {
            setErrorGuardar(
              `El ${ETIQUETA_CAMPO[invalido].toLowerCase()} real de "${m.descripcion}" ` +
                `(${item.descripcion}) no es un número válido mayor o igual a 0.`,
            );
            return;
          }
        }
      }
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
      // Se escribe en unidad de compra y se guarda en unidad BASE: así la base
      // queda toda en la misma unidad y el desvío compara contra el previsto
      // sin depender de en qué unidad se cargó. Sin conversión el factor es 1.
      const { factor } = unidadDeCarga(fila);
      insumos.push({ insumo_id: fila.insumo_id, cantidad_real: cantidad * factor });
    }

    setGuardando(true);
    try {
      /* Se guarda la cantidad ejecutada por ítem (la suma de sus mediciones
       * tildadas) junto con las mediciones y sus medidas reales. El PUT
       * reemplaza los hijos enteros, así que se manda siempre todo. */
      const payload = {
        fecha,
        descripcion: descripcion.trim() === '' ? null : descripcion.trim(),
        items: ejecutados,
        insumos,
      };

      if (certificacion) {
        await actualizarCertificacion(certificacion.id, payload);
      } else {
        await crearCertificacion(payload);
      }

      // Sin esto, las mediciones recién certificadas seguirían apareciendo
      // disponibles hasta recargar la página.
      await recargarItems();
      onGuardado(
        certificacion
          ? 'Certificación actualizada.'
          : 'Certificación guardada. Ya podés verla en la lista.',
      );
    } catch (err) {
      setErrorGuardar((err as Error).message);
    } finally {
      setGuardando(false);
    }
  }, [
    ejecutados,
    datos.rubros,
    seleccion.mediciones,
    medidasDe,
    filasMaterial,
    reales,
    fecha,
    descripcion,
    certificacion,
    crearCertificacion,
    actualizarCertificacion,
    recargarItems,
    onGuardado,
  ]);

  return (
    <div className="flex flex-col gap-4">
      {/* ── Datos generales ── */}
      <section style={GLASS_CARD} className="p-5">
        <div className="flex items-baseline justify-between mb-4 gap-3">
          <h3 className="text-base font-semibold" style={{ color: TEXTO }}>
            {certificacion
              ? `Editando la certificación del ${formatFecha(certificacion.fecha)}`
              : 'Nueva certificación'}
          </h3>
          <button
            onClick={onCancelar}
            className="text-sm font-medium transition-colors hover:bg-black/[0.04] rounded-full px-3 py-1"
            style={{ color: TEXTO_2 }}
          >
            Cancelar
          </button>
        </div>
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
              onChange={(e) => setFecha(e.target.value)}
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
              onChange={(e) => setDescripcion(e.target.value)}
              style={INPUT}
            />
          </div>
        </div>
      </section>

      {/* ── Ítems ejecutados y medidas reales ── */}
      <section style={GLASS_CARD} className="p-5">
        <div className="flex items-baseline justify-between mb-1 gap-3">
          <h3 className="text-base font-semibold" style={{ color: TEXTO }}>
            Mediciones ejecutadas
          </h3>
          <span className="text-sm" style={{ color: TEXTO_2 }}>
            {totalMedicionesTildadas === 0
              ? 'Nada tildado'
              : `${totalMedicionesTildadas} ${
                  totalMedicionesTildadas === 1 ? 'medición tildada' : 'mediciones tildadas'
                } en ${itemIds.length} ${itemIds.length === 1 ? 'ítem' : 'ítems'}`}
          </span>
        </div>
        <p className="text-xs mb-4" style={{ color: TEXTO_3 }}>
          Las medidas vienen del cómputo. Cambialas solo si la pared salió distinta: ahí se
          guarda la medida real y se recalcula el material.
        </p>

        {datos.rubros.length === 0 && (
          <p className="text-sm" style={{ color: TEXTO_2 }}>
            Esta obra todavía no tiene ítems cargados en el cómputo.
          </p>
        )}

        <div className="flex flex-col gap-5">
          {datos.rubros.map((rubro) => {
            const estadoRubro: EstadoTilde = estadoDelRubro(rubro, seleccion, disponibilidad);

            return (
              <div key={rubro.rubro_id}>
                <div
                  className="flex items-center gap-2 pb-1.5 mb-1"
                  style={{ borderBottom: BORDE_SUTIL }}
                >
                  <CheckTriestado
                    estado={estadoRubro}
                    onChange={() => alternarRubro(rubro)}
                    className="w-4 h-4 cursor-pointer"
                  />
                  <span className="text-sm font-semibold" style={{ color: TEXTO }}>
                    {rubro.rubro_nombre}
                  </span>
                </div>

                {rubro.items.map((item) => {
                  const estado = estadoDelItem(item, seleccion, disponibilidad);
                  const abierto = expandidos.has(item.item_id);
                  // Ahora cualquier ítem con mediciones se despliega: adentro
                  // están las medidas reales, no solo el tilde.
                  const desplegable = item.mediciones.length > 0;
                  const ejecutado = cantidadEjecutada(item, seleccion);
                  const yaCertificadas = certificadasDelItem(item, disponibilidad);
                  const completo = itemCompletamenteCertificado(item, disponibilidad);
                  const corregidas = item.mediciones.filter(
                    (m) => seleccion.mediciones.has(m.id) && difiereDelComputo(medidasDe(m), m),
                  ).length;

                  return (
                    <div key={item.item_id} style={{ opacity: completo ? 0.55 : 1 }}>
                      <div className="flex items-center gap-3 py-2 px-1 rounded-lg transition-colors hover:bg-black/[0.02]">
                        <CheckTriestado
                          estado={estado}
                          onChange={() => alternarItem(item)}
                          disabled={completo}
                        />

                        {desplegable ? (
                          <button
                            onClick={() => alternarExpandido(item.item_id)}
                            className="flex items-center gap-2 flex-1 min-w-0 text-left"
                          >
                            <span
                              className="text-[10px] shrink-0"
                              style={{
                                color: TEXTO_3,
                                display: 'inline-block',
                                transform: abierto ? 'rotate(90deg)' : 'none',
                              }}
                            >
                              ▶
                            </span>
                            <span className="text-sm truncate" style={{ color: TEXTO }}>
                              {item.descripcion}
                            </span>
                            {/* Avance: cuántas paredes ya se certificaron. */}
                            <span className="text-xs shrink-0" style={{ color: TEXTO_3 }}>
                              {yaCertificadas > 0
                                ? `${yaCertificadas} de ${item.mediciones.length} certificadas`
                                : `${item.mediciones.length} ${
                                    item.mediciones.length === 1 ? 'medición' : 'mediciones'
                                  }`}
                            </span>
                          </button>
                        ) : (
                          <span className="text-sm flex-1 truncate pl-4" style={{ color: TEXTO }}>
                            {item.descripcion}
                          </span>
                        )}

                        {corregidas > 0 && (
                          <Chip
                            severidad="no_previsto"
                            texto={`${corregidas} ${
                              corregidas === 1 ? 'corregida' : 'corregidas'
                            }`}
                          />
                        )}
                        {completo && <Chip severidad="en_linea" texto="certificado" />}

                        {/* Con selección parcial se muestra lo ejecutado sobre
                            el total, para no perder de vista la proporción. */}
                        <span className="text-sm tabular-nums" style={{ color: TEXTO_2 }}>
                          {estado === 'algunas' ? (
                            <>
                              <span style={{ color: ACENTO_TEXTO, fontWeight: 600 }}>
                                {formatNum(ejecutado, item.unidad_medida)}
                              </span>
                              <span style={{ color: TEXTO_3 }}>
                                {' / '}
                                {formatNum(item.cantidad_total, item.unidad_medida)}
                              </span>
                            </>
                          ) : (
                            formatNum(item.cantidad_total, item.unidad_medida)
                          )}
                        </span>
                        <span
                          className="text-xs w-10 text-left shrink-0"
                          style={{ color: TEXTO_3 }}
                        >
                          {item.unidad_medida}
                        </span>
                      </div>

                      {/* Mediciones del ítem */}
                      {desplegable && abierto && (
                        <div
                          className="ml-7 pl-3 mb-1"
                          style={{ borderLeft: '2px solid rgba(0, 0, 0, 0.06)' }}
                        >
                          {item.mediciones.map((m) => (
                            <FilaMedicion
                              key={m.id}
                              medicion={m}
                              unidadMedida={item.unidad_medida}
                              seleccionada={seleccion.mediciones.has(m.id)}
                              certificada={certificadasPorId.get(m.id)?.fecha ?? null}
                              reabierta={reabiertas.has(m.id)}
                              medidas={medidasDe(m)}
                              onAlternar={() => alternarMedicion(m.id)}
                              onReabrir={() => reabrir(m.id)}
                              onEditar={(campo, valor) => editarMedida(m, campo, valor)}
                              onRestaurar={() => restaurarMedida(m.id)}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
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
          <div className="mb-4">
            <AvisoError mensaje={errorPrevisto} />
          </div>
        )}

        {itemIds.length === 0 && !errorPrevisto && (
          <p className="text-sm" style={{ color: TEXTO_2 }}>
            Tildá las mediciones ejecutadas para ver el material previsto.
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
                {filasMaterial.map((fila) => {
                  const { unidad, factor, convertido } = unidadDeCarga(fila);
                  const previstoEnCarga = fila.cantidad_prevista / factor;
                  return (
                    <tr key={fila.insumo_id}>
                      <td
                        className="text-sm py-2 px-2"
                        style={{ color: TEXTO, borderBottom: BORDE_FILA }}
                      >
                        {fila.nombre}
                        {fila.esExtra && (
                          <span className="ml-2">
                            <Chip severidad="no_previsto" texto="no previsto" />
                          </span>
                        )}
                      </td>
                      <td
                        className="text-sm py-2 px-2"
                        style={{ color: TEXTO_3, borderBottom: BORDE_FILA }}
                      >
                        {pluralizar(2, unidad)}
                        {/* Con conversión, la unidad base queda como referencia. */}
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
                        {fila.esExtra ? (
                          '—'
                        ) : (
                          <>
                            {formatNum(previstoEnCarga, unidad)}
                            {convertido && (
                              <span className="block text-[11px]" style={{ color: TEXTO_3 }}>
                                {formatNum(fila.cantidad_prevista, fila.unidad_medida)}{' '}
                                {fila.unidad_medida}
                              </span>
                            )}
                          </>
                        )}
                      </td>
                      <td className="py-1.5 px-2" style={{ borderBottom: BORDE_FILA }}>
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            inputMode="decimal"
                            value={reales[fila.insumo_id] ?? ''}
                            placeholder="0"
                            onChange={(e) => {
                              const valor = e.target.value;
                              setReales((prev) => ({ ...prev, [fila.insumo_id]: valor }));
                            }}
                            style={{
                              ...INPUT,
                              padding: '6px 10px',
                              flex: 1,
                              minWidth: 0,
                              textAlign: 'right',
                            }}
                          />
                          {/* La unidad al lado del campo: el encargado no tiene
                              que deducir si escribe bolsas o kilos. */}
                          <span
                            className="text-xs shrink-0 whitespace-nowrap"
                            style={{ color: TEXTO_2 }}
                          >
                            {pluralizar(2, unidad)}
                          </span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Material que las recetas no contemplaban */}
        {itemIds.length > 0 && (
          <div
            className="flex flex-wrap items-end gap-3 mt-4 pt-4"
            style={{ borderTop: BORDE_SUTIL }}
          >
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
        {errorGuardar && <AvisoError mensaje={errorGuardar} />}

        <div className="flex items-center justify-end gap-3">
          <button
            onClick={onCancelar}
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
            Cancelar
          </button>
          <button
            onClick={guardar}
            disabled={guardando || ejecutados.length === 0}
            className="text-sm font-semibold transition-colors disabled:opacity-40"
            style={{
              padding: '10px 24px',
              background: ACENTO,
              border: 'none',
              borderRadius: '9999px',
              color: ACENTO_TEXTO,
            }}
          >
            {guardando
              ? 'Guardando…'
              : certificacion
                ? 'Guardar cambios'
                : 'Guardar certificación'}
          </button>
        </div>
      </section>
    </div>
  );
}

/* ─── Una medición, con sus medidas reales ─────────────────────────────────── */

function FilaMedicion({
  medicion,
  unidadMedida,
  seleccionada,
  certificada,
  reabierta,
  medidas,
  onAlternar,
  onReabrir,
  onEditar,
  onRestaurar,
}: {
  medicion: CertificacionMedicion;
  unidadMedida: string;
  seleccionada: boolean;
  /** Fecha en que se certificó en OTRA certificación, o null si está libre. */
  certificada: string | null;
  reabierta: boolean;
  medidas: MedidasTexto;
  onAlternar: () => void;
  onReabrir: () => void;
  onEditar: (campo: keyof MedidasTexto, valor: string) => void;
  onRestaurar: () => void;
}) {
  const dims = dimensiones(medicion);
  // Bloqueada = ya certificada en otra certificación y todavía no reabierta.
  const bloqueada = certificada !== null && !reabierta;
  const corregida = difiereDelComputo(medidas, medicion);
  const cantidadReal = cantidadDeMedidas(medidas);
  const desvio = cantidadReal === null ? null : cantidadReal - medicion.cantidad_calculada;
  const desvioPct =
    desvio === null || medicion.cantidad_calculada <= 0
      ? null
      : (desvio / medicion.cantidad_calculada) * 100;

  // Sin bloquear, toda la fila tildea: el checkbox solo es un blanco chico.
  // Bloqueada tiene adentro el botón de reabrir, que no puede vivir en un label.
  const Fila = bloqueada ? 'div' : 'label';

  return (
    <div style={{ opacity: bloqueada ? 0.5 : 1 }}>
      <Fila
        className={
          'flex items-center gap-3 py-1.5 px-1 rounded-lg transition-colors ' +
          (bloqueada ? '' : 'cursor-pointer hover:bg-black/[0.02]')
        }
      >
        <input
          type="checkbox"
          checked={seleccionada}
          onChange={onAlternar}
          disabled={bloqueada}
          className="w-4 h-4 shrink-0 disabled:cursor-not-allowed cursor-pointer"
          style={{ accentColor: ACENTO }}
        />
        <span className="text-sm flex-1 truncate" style={{ color: TEXTO_2 }}>
          {medicion.descripcion}
        </span>

        {certificada !== null && (
          <Chip
            severidad={reabierta ? 'no_previsto' : 'sin_consumo'}
            texto={reabierta ? 'reabierta' : `ya certificada · ${formatFecha(certificada)}`}
          />
        )}

        {/* Reabrir: gesto deliberado, solo para corregir. */}
        {bloqueada && (
          <button
            onClick={onReabrir}
            className="text-[11px] font-medium px-2 py-0.5 rounded-full shrink-0 transition-colors hover:bg-black/[0.06]"
            style={{ color: TEXTO_2, border: BORDE_SUTIL }}
          >
            Reabrir
          </button>
        )}

        {dims && (
          <span className="text-xs tabular-nums shrink-0" style={{ color: TEXTO_3 }}>
            {dims}
          </span>
        )}
        <span className="text-sm tabular-nums shrink-0" style={{ color: TEXTO_2 }}>
          {formatNum(medicion.cantidad_calculada, unidadMedida)}
        </span>
        <span className="text-xs w-10 shrink-0" style={{ color: TEXTO_3 }}>
          {unidadMedida}
        </span>
      </Fila>

      {/* Medidas reales: solo de lo que se está certificando ahora. */}
      {seleccionada && !bloqueada && (
        <div
          className="ml-7 mb-2 p-3 rounded-xl flex flex-wrap items-end gap-3"
          style={{
            background: corregida ? 'rgba(245, 166, 35, 0.10)' : 'rgba(255, 255, 255, 0.45)',
            border: corregida
              ? '1px solid rgba(245, 166, 35, 0.35)'
              : '1px solid rgba(255, 255, 255, 0.60)',
          }}
        >
          {CAMPOS_MEDIDA.map((campo) => (
            <div key={campo} className="flex flex-col gap-1">
              <label
                className="text-[10px] font-semibold uppercase tracking-wide"
                style={{ color: TEXTO_3 }}
              >
                {ETIQUETA_CAMPO[campo]}
              </label>
              <input
                type="text"
                inputMode="decimal"
                value={medidas[campo]}
                placeholder="—"
                onChange={(e) => onEditar(campo, e.target.value)}
                style={{
                  ...INPUT,
                  padding: '5px 8px',
                  width: '78px',
                  textAlign: 'right',
                  fontSize: '13px',
                }}
              />
            </div>
          ))}

          <div className="flex flex-col gap-1">
            <span
              className="text-[10px] font-semibold uppercase tracking-wide"
              style={{ color: TEXTO_3 }}
            >
              Cantidad real
            </span>
            <span
              className="text-sm tabular-nums font-semibold py-[6px]"
              style={{ color: cantidadReal === null ? '#DC2626' : TEXTO }}
            >
              {cantidadReal === null
                ? 'revisá los números'
                : `${formatNum(cantidadReal, unidadMedida)} ${unidadMedida}`}
            </span>
          </div>

          {/* El desvío de esta pared, en vivo. */}
          {corregida && desvio !== null && (
            <div className="flex items-center gap-2 pb-1">
              <Chip
                severidad={clasificarComputo(desvio, desvioPct)}
                fuerte={esFuerte(desvioPct)}
                texto={
                  `${formatDesvio(desvio, unidadMedida)} ${unidadMedida}` +
                  (desvioPct === null ? '' : ` · ${formatPct(desvioPct)}`)
                }
              />
              <button
                onClick={onRestaurar}
                className="text-[11px] font-medium px-2 py-0.5 rounded-full transition-colors hover:bg-black/[0.06]"
                style={{ color: TEXTO_2, border: BORDE_SUTIL }}
              >
                Volver al cómputo
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default FormularioCertificacion;
