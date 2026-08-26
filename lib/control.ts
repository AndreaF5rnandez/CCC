import type { createSupabaseServerClient } from "./supabaseServer";
import { calcularCantidadTotalItem, calcularPrecioReceta } from "./calculos";
import type {
  CertificacionConDesvio,
  CompraConDesvio,
  CompraConsolidadaInsumo,
  ControlCascada,
  ControlMaterial,
  ControlMes,
  ControlObraResponse,
  ControlRango,
  ControlRubro,
  Planificacion,
  RecetaConInsumos,
} from "../types";

type SupabaseServer = ReturnType<typeof createSupabaseServerClient>;

/**
 * Control de obra: los tres desvíos en plata, y el avance contra la
 * planificación mensual.
 *
 * Es la única pantalla que cruza los tres módulos (planificación, certificación
 * y compras), así que el cruce se hace acá, una sola vez, y no en la vista: si
 * cada tile calculara lo suyo, la cascada y las tablas podrían no cerrar.
 *
 * Nada de esto se guarda. Como todos los desvíos del sistema, se recalcula al
 * leer: corregir un precio o una medición se refleja solo.
 */

/* ─── Ítems de la obra con sus precios ─────────────────────────────────────── */

/** Un ítem con lo que el control necesita: a qué rubro pertenece, cuánto vale y
 *  qué porcentaje de avance tiene planificado cada mes.
 *
 *  El precio va partido en dos porque la cascada corre SOLO sobre materiales
 *  (es lo único con consumo real cargado), mientras que el avance en plata usa
 *  el precio completo: la obra hecha vale lo que vale, con mano de obra
 *  adentro. */
export interface ItemControl {
  item_id: string;
  descripcion: string;
  unidad_medida: string;
  rubro_id: string;
  rubro_nombre: string;
  cantidad_total: number;
  /** Costo-costo por unidad: los tres tipos de insumo. */
  precio_unitario: number;
  /** La porción de ese precio que son materiales. */
  precio_material: number;
  planificacion: Array<Pick<Planificacion, "mes" | "pct_plan">>;
}

type ItemRaw = {
  id: string;
  descripcion: string;
  unidad_medida: string;
  receta: RecetaConInsumos | null;
  mediciones: Array<{ cantidad_calculada: number }>;
  planificacion: Array<Pick<Planificacion, "mes" | "pct_plan">> | null;
};

type RubroRaw = {
  id: string;
  nombre: string;
  orden: number;
  items: ItemRaw[];
};

const RUBROS_SELECT = `
  id,
  nombre,
  orden,
  items (
    id,
    descripcion,
    unidad_medida,
    receta:recetas (
      *,
      ingredientes:receta_insumos (
        *,
        insumo:insumos (*)
      )
    ),
    mediciones (
      cantidad_calculada
    ),
    planificacion (
      mes,
      pct_plan
    )
  )
`;

/**
 * Trae los ítems de la obra con su rubro, su precio y su planificación.
 *
 * Es la misma consulta que usa la pantalla de Planificación. Un ítem sin receta
 * entra igual, con precio 0: no aporta plata, pero si se certificó tiene que
 * aparecer en su rubro en vez de desaparecer sin aviso.
 */
export async function cargarItemsDeObra(
  supabase: SupabaseServer,
  obraId: string,
): Promise<{ items: Map<string, ItemControl>; totalPresupuesto: number }> {
  const { data, error } = await supabase
    .from("rubros")
    .select(RUBROS_SELECT)
    .eq("obra_id", obraId)
    .order("orden", { ascending: true });

  if (error) throw error;

  const items = new Map<string, ItemControl>();
  let totalPresupuesto = 0;

  for (const rubro of (data ?? []) as unknown as RubroRaw[]) {
    for (const item of rubro.items ?? []) {
      const ingredientes = item.receta?.ingredientes ?? [];
      const cantidadTotal = calcularCantidadTotalItem(item.mediciones ?? []);

      // Misma función para los dos precios: el de materiales es la misma cuenta
      // sobre el subconjunto de ingredientes, no una fórmula nueva.
      const precioUnitario = calcularPrecioReceta(ingredientes);
      const precioMaterial = calcularPrecioReceta(
        ingredientes.filter((ing) => ing.insumo?.tipo === "material"),
      );

      totalPresupuesto += cantidadTotal * precioUnitario;

      items.set(item.id, {
        item_id: item.id,
        descripcion: item.descripcion,
        unidad_medida: item.unidad_medida,
        rubro_id: rubro.id,
        rubro_nombre: rubro.nombre,
        cantidad_total: cantidadTotal,
        precio_unitario: precioUnitario,
        precio_material: precioMaterial,
        planificacion: item.planificacion ?? [],
      });
    }
  }

  return { items, totalPresupuesto };
}

/* ─── Meses ────────────────────────────────────────────────────────────────── */

/**
 * En qué mes de la obra cae una fecha.
 *
 * La planificación guarda el mes como índice relativo (1 = primer mes), no como
 * fecha, justamente para que la obra pueda arrancar cuando arranque. La fecha
 * de inicio de la obra es la que traduce ese índice a calendario, y acá se hace
 * el camino inverso: de la fecha real de una certificación o una compra al mes
 * al que pertenece.
 *
 * @returns El índice de mes (1 en adelante), o null sin fecha de inicio.
 */
export function mesDeFecha(fecha: string, fechaInicio: string | null): number | null {
  if (!fechaInicio) return null;

  const [y, m] = fecha.slice(0, 10).split("-").map(Number);
  const [y0, m0] = fechaInicio.slice(0, 10).split("-").map(Number);
  if (!y || !m || !y0 || !m0) return null;

  const indice = (y - y0) * 12 + (m - m0) + 1;
  // Algo fechado antes del inicio de la obra cae en el mes 1: es más útil que
  // esconderlo en un mes 0 o negativo que la curva no dibujaría.
  return Math.max(1, indice);
}

/** Etiqueta del mes: calendario si la obra tiene fecha de inicio, relativa si no. */
export function etiquetaMes(mes: number, fechaInicio: string | null): string {
  if (!fechaInicio) return `Mes ${mes}`;

  const [y0, m0] = fechaInicio.slice(0, 10).split("-").map(Number);
  if (!y0 || !m0) return `Mes ${mes}`;

  const fecha = new Date(Date.UTC(y0, m0 - 1 + (mes - 1), 1));
  const texto = new Intl.DateTimeFormat("es-AR", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(fecha);
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

/* ─── El cálculo ───────────────────────────────────────────────────────────── */

/** Precio realmente pagado por unidad BASE, sacado del consolidado de compras.
 *
 *  El consolidado trabaja en unidad de COMPRA (una bolsa a $160); el consumo se
 *  guarda en unidad base (kg). Dividir por el factor lleva las dos puntas a la
 *  misma unidad, que es la única forma de restarlas. */
function precioRealPorUnidadBase(fila: CompraConsolidadaInsumo): number | null {
  const factor = fila.factor_compra;
  if (factor === null || factor <= 0) return fila.precio_promedio_compra;
  return fila.precio_promedio_compra / factor;
}

/** El período que pide la pantalla. Sin nada, se asume "hasta hoy". */
export interface RangoPedido {
  desde?: number | null;
  hasta?: number | null;
}

/** Hasta qué mes llega la obra: el plazo, lo que dure el plan, y lo que haya
 *  pasado de verdad (una certificación fuera de plazo no se puede esconder). */
function calcularMesesTotales(
  obra: { plazo_meses: number | null; fecha_inicio: string | null },
  items: Map<string, ItemControl>,
  certificaciones: CertificacionConDesvio[],
  compras: CompraConDesvio[],
  mesActual: number | null,
): number {
  let maximo = Math.max(obra.plazo_meses ?? 0, mesActual ?? 0, 1);

  for (const item of items.values()) {
    for (const { mes } of item.planificacion) maximo = Math.max(maximo, mes);
  }
  for (const cert of certificaciones) {
    maximo = Math.max(maximo, mesDeFecha(cert.fecha, obra.fecha_inicio) ?? 0);
  }
  for (const compra of compras) {
    maximo = Math.max(maximo, mesDeFecha(compra.fecha, obra.fecha_inicio) ?? 0);
  }

  return maximo;
}

/**
 * Traduce el período pedido a un rango de meses válido, y le pone nombre.
 *
 * El default es "hasta hoy" y no "toda la obra" a propósito: comparar lo hecho
 * hasta hoy contra el plan completo de la obra diría que vamos atrasadísimos
 * siempre, incluso yendo perfecto.
 *
 * @returns null si la obra no tiene fecha de inicio: sin ella no hay meses en
 *   los que recortar, y se muestra todo junto.
 */
function resolverRango(
  pedido: RangoPedido,
  fechaInicio: string | null,
  mesActual: number | null,
  mesesTotales: number,
): ControlRango | null {
  if (!fechaInicio) return null;

  const acotar = (v: number) => Math.min(Math.max(Math.trunc(v), 1), mesesTotales);

  const desde = acotar(pedido.desde ?? 1);
  // Sin "hasta" explícito, el corte es hoy; si la obra ni empezó, el mes 1.
  const hastaCrudo = pedido.hasta ?? mesActual ?? 1;
  // Un rango al revés se endereza en vez de devolver vacío: es un error de
  // tipeo del que llama, no una pregunta legítima.
  const hasta = Math.max(acotar(hastaCrudo), desde);

  return { desde, hasta, etiqueta: etiquetaRango(desde, hasta, mesActual, mesesTotales, fechaInicio) };
}

function etiquetaRango(
  desde: number,
  hasta: number,
  mesActual: number | null,
  mesesTotales: number,
  fechaInicio: string,
): string {
  if (desde === 1 && hasta === mesesTotales) return "Toda la obra";
  if (desde === 1 && hasta === mesActual) return "Hasta hoy";
  if (desde === hasta) return etiquetaMes(desde, fechaInicio);
  if (desde === 1) return `Primeros ${hasta} meses`;
  return `${etiquetaMes(desde, fechaInicio)} a ${etiquetaMes(hasta, fechaInicio)}`;
}

/** Pesos para los avisos. La pantalla usa `formatPrecio`; acá se necesita el
 *  mismo formato del lado del servidor, donde ese módulo no se importa. */
function formatearPesos(valor: number): string {
  return new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS" }).format(valor);
}

interface AcumuladoMaterial {
  previsto: number;
  consumido: number;
}

/**
 * Arma toda la respuesta del control a partir de lo que ya calcularon los otros
 * módulos. Es pura: recibe los datos cargados y no vuelve a la base.
 *
 * @param items Ítems de la obra con precios y planificación.
 * @param certificaciones Certificaciones con su desvío ya calculado.
 * @param compras Compras de la obra, para la plata que salió por mes.
 * @param consolidado Precio real promedio ponderado por insumo.
 */
export function calcularControl(
  obra: { id: string; nombre: string; fecha_inicio: string | null; plazo_meses: number | null },
  items: Map<string, ItemControl>,
  totalPresupuesto: number,
  certificaciones: CertificacionConDesvio[],
  compras: CompraConDesvio[],
  consolidado: CompraConsolidadaInsumo[],
  hoy: string,
  pedido: RangoPedido = {},
): ControlObraResponse {
  const avisos: string[] = [];
  const mesActual = mesDeFecha(hoy, obra.fecha_inicio);

  /* El período se resuelve ANTES de sumar nada: lo que queda afuera no entra a
   * ninguna cuenta. Así "los primeros tres meses" es una pregunta que se
   * contesta con los mismos números que "la obra entera", no con un recorte
   * hecho a mano sobre totales ya sumados. */
  const mesesTotales = calcularMesesTotales(obra, items, certificaciones, compras, mesActual);
  const rango = resolverRango(pedido, obra.fecha_inicio, mesActual, mesesTotales);

  /** ¿Esta fecha cae adentro del período que se está mirando? */
  const enRango = (fecha: string): boolean => {
    if (!rango) return true;
    const mes = mesDeFecha(fecha, obra.fecha_inicio);
    return mes !== null && mes >= rango.desde && mes <= rango.hasta;
  };

  const certificacionesDelRango = certificaciones.filter((c) => enRango(c.fecha));
  const comprasDelRango = compras.filter((c) => enRango(c.fecha));

  /* ── Cascada y avance: una pasada por lo certificado ────────────────── */
  let baseMaterial = 0;
  let desvioComputo = 0;
  let certificadoMonto = 0;
  let crecimientoAlcance = 0;
  let manoObraCertificada = 0;

  // Desvío de cómputo por rubro. En plata los rubros sí se pueden sumar.
  const porRubro = new Map<string, ControlRubro>();
  const itemsPorRubro = new Map<string, Set<string>>();

  for (const cert of certificacionesDelRango) {
    for (const linea of cert.items) {
      const item = items.get(linea.item_id);
      if (!item) continue;

      /* La cantidad del CÓMPUTO es la que se compara contra el plan: el plan
       * está escrito como % del cómputo. Lo que la obra creció por medidas
       * reales va aparte, para no mezclar atraso con crecimiento de alcance. */
      const montoCertificado = linea.cantidad_planificada * item.precio_unitario;
      const montoCrecimiento = linea.ajuste_medidas_reales * item.precio_unitario;

      certificadoMonto += montoCertificado;
      crecimientoAlcance += montoCrecimiento;
      baseMaterial += linea.cantidad_planificada * item.precio_material;
      desvioComputo += linea.ajuste_medidas_reales * item.precio_material;
      manoObraCertificada +=
        linea.cantidad_planificada * (item.precio_unitario - item.precio_material);

      const acum = porRubro.get(item.rubro_id) ?? {
        rubro_id: item.rubro_id,
        rubro_nombre: item.rubro_nombre,
        certificado_monto: 0,
        desvio_computo_monto: 0,
        desvio_computo_pct: null,
        items_certificados: 0,
      };
      acum.certificado_monto += montoCertificado;
      acum.desvio_computo_monto += linea.ajuste_medidas_reales * item.precio_material;
      porRubro.set(item.rubro_id, acum);

      const vistos = itemsPorRubro.get(item.rubro_id) ?? new Set<string>();
      vistos.add(item.item_id);
      itemsPorRubro.set(item.rubro_id, vistos);
    }
  }

  for (const [rubroId, rubro] of porRubro) {
    rubro.items_certificados = itemsPorRubro.get(rubroId)?.size ?? 0;
    // El % del desvío de cómputo se mide contra el material certificado del
    // rubro, no contra su total: es lo que la cascada mueve.
    const baseRubro = rubro.certificado_monto;
    rubro.desvio_computo_pct =
      baseRubro > 0 ? (rubro.desvio_computo_monto / baseRubro) * 100 : null;
  }

  /* ── Material: previsto contra consumido, sumando todas las certificaciones ── */
  const acumPorInsumo = new Map<string, AcumuladoMaterial>();
  const metadatosInsumos = new Map<string, CertificacionConDesvio["desvio"][number]>();

  for (const cert of certificacionesDelRango) {
    for (const fila of cert.desvio) {
      if (fila.tipo !== "material") continue;
      const acum = acumPorInsumo.get(fila.insumo_id) ?? { previsto: 0, consumido: 0 };
      acum.previsto += fila.cantidad_prevista;
      acum.consumido += fila.cantidad_real;
      acumPorInsumo.set(fila.insumo_id, acum);
      metadatosInsumos.set(fila.insumo_id, fila);
    }
  }

  const consolidadoPorInsumo = new Map(consolidado.map((c) => [c.insumo_id, c]));

  let desvioMaterial = 0;
  let desvioPrecio = 0;
  let consumidoAPrecioReal = 0;
  let sinPrecioReal = 0;

  const materiales: ControlMaterial[] = [];

  for (const [insumoId, acum] of acumPorInsumo) {
    const meta = metadatosInsumos.get(insumoId);
    if (!meta) continue;

    const compra = consolidadoPorInsumo.get(insumoId) ?? null;
    const precioReal = compra ? precioRealPorUnidadBase(compra) : null;

    // Desvío de consumo: se usó más o menos de lo que la receta pedía para la
    // cantidad REAL. Valorizado a precio de lista, para que este escalón mida
    // rendimiento y no precio.
    const desvioCantidad = acum.consumido - acum.previsto;
    const montoMaterial = desvioCantidad * meta.precio_unitario;
    desvioMaterial += montoMaterial;

    // Desvío de precio sobre lo CONSUMIDO: así la cascada cierra exacta contra
    // el costo real de lo ejecutado. Lo comprado y todavía sin usar se informa
    // aparte, en la caja.
    const montoPrecio =
      precioReal === null ? 0 : acum.consumido * (precioReal - meta.precio_unitario);
    desvioPrecio += montoPrecio;

    consumidoAPrecioReal += acum.consumido * (precioReal ?? meta.precio_unitario);
    if (precioReal === null && acum.consumido > 0) sinPrecioReal += 1;

    materiales.push({
      insumo_id: meta.insumo_id,
      nombre: meta.nombre,
      unidad_medida: meta.unidad_medida,
      tipo: meta.tipo,
      precio_unitario: meta.precio_unitario,
      unidad_compra: meta.unidad_compra,
      factor_compra: meta.factor_compra,
      factor_origen: meta.factor_origen,
      factor_referencia: meta.factor_referencia,
      previsto: acum.previsto,
      consumido: acum.consumido,
      desvio_material_monto: montoMaterial,
      precio_real: precioReal,
      desvio_precio_monto: montoPrecio,
      comprado_cantidad: compra?.cantidad_total ?? 0,
      comprado_monto: compra?.gasto_total ?? 0,
    });
  }

  materiales.sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));

  if (sinPrecioReal > 0) {
    avisos.push(
      sinPrecioReal === 1
        ? "Hay 1 material consumido sin ninguna compra registrada: se valorizó al precio presupuestado."
        : `Hay ${sinPrecioReal} materiales consumidos sin ninguna compra registrada: se valorizaron al precio presupuestado.`,
    );
  }

  const costoReal = baseMaterial + desvioComputo + desvioMaterial + desvioPrecio;
  const desvioTotal = costoReal - baseMaterial;

  const cascada: ControlCascada = {
    base_material: baseMaterial,
    desvio_computo: desvioComputo,
    desvio_material: desvioMaterial,
    desvio_precio: desvioPrecio,
    costo_real: costoReal,
    desvio_total: desvioTotal,
    desvio_total_pct: baseMaterial > 0 ? (desvioTotal / baseMaterial) * 100 : null,
  };

  /* ── Plan y gasto por mes ───────────────────────────────────────────── */
  const planPorMes = new Map<number, number>();
  for (const item of items.values()) {
    const montoItem = item.cantidad_total * item.precio_unitario;
    for (const { mes, pct_plan } of item.planificacion) {
      planPorMes.set(mes, (planPorMes.get(mes) ?? 0) + (montoItem * Number(pct_plan)) / 100);
    }
  }

  let compradoMonto = 0;
  for (const compra of comprasDelRango) compradoMonto += compra.gasto;

  /* Las series de la curva se arman con TODO, no con el rango: la curva muestra
   * siempre la obra completa y sombrea el período elegido. Recortarle el eje
   * escondería justamente el contexto que hace legible el recorte. */
  const gastadoPorMes = new Map<number, number>();
  for (const compra of compras) {
    const mes = mesDeFecha(compra.fecha, obra.fecha_inicio);
    if (mes !== null) gastadoPorMes.set(mes, (gastadoPorMes.get(mes) ?? 0) + compra.gasto);
  }

  const certificadoTodosLosMeses = new Map<number, number>();
  for (const cert of certificaciones) {
    const mes = mesDeFecha(cert.fecha, obra.fecha_inicio);
    if (mes === null) continue;
    let monto = 0;
    for (const linea of cert.items) {
      const item = items.get(linea.item_id);
      if (item) monto += linea.cantidad_planificada * item.precio_unitario;
    }
    certificadoTodosLosMeses.set(mes, (certificadoTodosLosMeses.get(mes) ?? 0) + monto);
  }

  const meses: ControlMes[] = [];
  let planAcum = 0;
  let certAcum = 0;
  let gastoAcum = 0;

  if (obra.fecha_inicio) {
    for (let mes = 1; mes <= mesesTotales; mes++) {
      const plan = planPorMes.get(mes) ?? 0;
      const certificado = certificadoTodosLosMeses.get(mes) ?? 0;
      const gastado = gastadoPorMes.get(mes) ?? 0;
      planAcum += plan;
      certAcum += certificado;
      gastoAcum += gastado;
      meses.push({
        mes,
        etiqueta: etiquetaMes(mes, obra.fecha_inicio),
        plan,
        certificado,
        gastado,
        plan_acum: planAcum,
        certificado_acum: certAcum,
        gastado_acum: gastoAcum,
        es_actual: mes === mesActual,
        en_rango: rango === null || (mes >= rango.desde && mes <= rango.hasta),
      });
    }
  } else {
    avisos.push(
      "La obra no tiene fecha de inicio cargada: sin ella no se puede ubicar cada certificación en su mes. Se carga en Planificación.",
    );
  }

  /* El plan con el que se compara es el del MISMO período que lo certificado.
   * Comparar todo el plan de la obra contra lo hecho hasta hoy diría que vamos
   * atrasadísimos siempre, y comparar un mes contra el plan entero, peor. */
  const planDelRango = rango
    ? meses
        .filter((m) => m.mes >= rango.desde && m.mes <= rango.hasta)
        .reduce((suma, m) => suma + m.plan, 0)
    : Array.from(planPorMes.values()).reduce((suma, v) => suma + v, 0);

  if (
    obra.fecha_inicio &&
    planPorMes.size === 0 &&
    certificaciones.length > 0
  ) {
    avisos.push(
      "Todavía no hay avance planificado por mes: cargá los porcentajes en Planificación para poder comparar contra lo certificado.",
    );
  }

  /* Si la suma de todos los meses no llega al presupuesto, hay ítems sin
   * porcentajes cargados: completando el plan entero igual no se llegaría al
   * 100% de la obra. Es un agujero en la planificación que se nota recién acá,
   * al comparar contra el total, así que la pantalla lo dice. */
  const planTotalObra = Array.from(planPorMes.values()).reduce((suma, v) => suma + v, 0);
  const sinPlanificar = totalPresupuesto - planTotalObra;
  if (planTotalObra > 0 && sinPlanificar > totalPresupuesto * 0.005) {
    const pct = (sinPlanificar / totalPresupuesto) * 100;
    avisos.push(
      `La planificación cubre ${formatearPesos(planTotalObra)} de ${formatearPesos(totalPresupuesto)}: ` +
        `quedan ${formatearPesos(sinPlanificar)} (${pct.toFixed(1)}%) de obra sin porcentajes cargados por mes. ` +
        `Aun completando todo el plan no se llegaría al 100%.`,
    );
  }

  return {
    obra_id: obra.id,
    obra_nombre: obra.nombre,
    fecha_inicio: obra.fecha_inicio,
    plazo_meses: obra.plazo_meses,
    total_presupuesto: totalPresupuesto,
    mes_actual: mesActual,
    meses_totales: mesesTotales,
    rango,
    avance: {
      plan_monto: planDelRango,
      plan_pct: totalPresupuesto > 0 ? (planDelRango / totalPresupuesto) * 100 : 0,
      certificado_monto: certificadoMonto,
      certificado_pct:
        totalPresupuesto > 0 ? (certificadoMonto / totalPresupuesto) * 100 : 0,
      crecimiento_alcance_monto: crecimientoAlcance,
      // Lo que suma el plan de TODA la obra, no solo del período: sirve para
      // ver si la planificación llega o no al presupuesto.
      plan_total_obra: planTotalObra,
    },
    cascada,
    mano_obra_certificada: manoObraCertificada,
    caja: {
      comprado: compradoMonto,
      consumido: consumidoAPrecioReal,
      diferencia: compradoMonto - consumidoAPrecioReal,
    },
    meses,
    rubros: Array.from(porRubro.values()).sort((a, b) =>
      b.certificado_monto - a.certificado_monto,
    ),
    materiales,
    avisos,
  };
}
