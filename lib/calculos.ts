import type {
  CierrePresupuesto,
  CompraResuelta,
  GastoGeneral,
  GastoGeneralCalculado,
  GastosGeneralesResumen,
  InsumoCompraObra,
  PaqueteEmpresario,
  PresupuestoLinea,
  RecetaConInsumos,
} from "../types";

function aplicarPorcentaje(base: number, porcentaje: number): number {
  return base * (porcentaje / 100);
}

/**
 * Calcula el precio unitario total de una receta a partir de sus ingredientes.
 *
 * @param ingredientes Array de relaciones receta-insumo con el objeto insumo cargado.
 * @returns La suma de cantidad por precio de cada ingrediente.
 */
export function calcularPrecioReceta(
  ingredientes: RecetaConInsumos["ingredientes"],
): number {
  return ingredientes.reduce((total, ingrediente) => {
    return total + ingrediente.cantidad * ingrediente.insumo.precio_unitario;
  }, 0);
}

/**
 * Cantidad total de un ítem = suma de `cantidad_calculada` de todas sus mediciones.
 *
 * Es la misma cantidad física que usan el cómputo, el presupuesto y el endpoint
 * de planificación (tarea 2) y la explosión de insumos. Fuente única: no
 * reimplementar esta suma en cada endpoint.
 *
 * @param mediciones Mediciones del ítem (solo se lee `cantidad_calculada`).
 * @returns La suma de las cantidades calculadas de todas las mediciones.
 */
export function calcularCantidadTotalItem(
  mediciones: { cantidad_calculada: number }[],
): number {
  return mediciones.reduce((suma, m) => suma + Number(m.cantidad_calculada), 0);
}

/**
 * Calcula la cantidad de una medicion: número de partes × largo × ancho × alto.
 *
 * Replica EXACTAMENTE la columna generada `cantidad_calculada` de PostgreSQL:
 * las dimensiones faltantes se reemplazan por 1 (COALESCE), nunca por 0.
 * La base de datos es la fuente de verdad; este helper sirve para previsualizar
 * el parcial en el front antes de guardar.
 *
 * @param n Número de partes iguales (por defecto 1).
 * @param largo Largo opcional; si falta se toma como 1.
 * @param ancho Ancho opcional; si falta se toma como 1.
 * @param alto Alto opcional; si falta se toma como 1.
 * @returns El producto de los cuatro factores.
 */
export function calcularCantidadMedicion(
  n: number = 1,
  largo?: number,
  ancho?: number,
  alto?: number,
): number {
  const factor = (v?: number) => (typeof v === "number" ? v : 1);
  return factor(n) * factor(largo) * factor(ancho) * factor(alto);
}

/* ─── Conversión a unidad de compra ────────────────────────────────────────── */

/**
 * Resuelve la conversión a unidad de compra vigente para un insumo en una obra.
 *
 * Precedencia (regla de un solo dueño por nivel): gana el override de la obra
 * si existe; si no, la referencia del insumo. La unidad puede venir del
 * override o heredarse de la referencia. Sin factor válido en ninguno de los
 * dos niveles, el insumo no tiene conversión y se muestra solo en unidad base.
 *
 * Es la ÚNICA implementación de esta precedencia: los endpoints la usan y el
 * frontend consume el resultado ya resuelto, no vuelve a decidir.
 *
 * @param referencia Campos de compra del insumo (nivel general).
 * @param override Fila de insumo_compra_obra de esta obra, si existe.
 */
export function resolverCompra(
  referencia: { unidad_compra?: string | null; factor_compra?: number | null },
  override?: Pick<InsumoCompraObra, "factor_compra" | "unidad_compra"> | null,
): CompraResuelta {
  const factorRef = numeroPositivoONull(referencia.factor_compra);
  const unidadRef = textoONull(referencia.unidad_compra);

  const factorObra = override ? numeroPositivoONull(override.factor_compra) : null;
  const unidadObra = override ? textoONull(override.unidad_compra) : null;

  // El override manda; la unidad se hereda de la referencia si no la pisó.
  const factor = factorObra ?? factorRef;
  const unidad = (factorObra !== null ? unidadObra ?? unidadRef : unidadRef);

  // Sin factor o sin unidad no hay nada que mostrar: la conversión necesita las dos.
  if (factor === null || unidad === null) {
    return {
      unidad_compra: null,
      factor_compra: null,
      factor_origen: null,
      factor_referencia: factorRef,
    };
  }

  return {
    unidad_compra: unidad,
    factor_compra: factor,
    factor_origen: factorObra !== null ? "obra" : "referencia",
    factor_referencia: factorRef,
  };
}

function numeroPositivoONull(v: number | null | undefined): number | null {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function textoONull(v: string | null | undefined): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t === "" ? null : t;
}

/**
 * Convierte una cantidad en unidad base a unidades de compra.
 *
 * Redondea SIEMPRE hacia arriba: no se compra media bolsa. La tolerancia
 * evita que un 3859,0000000001 de acumulación en punto flotante se lleve una
 * bolsa entera de más.
 *
 * @param cantidadBase Cantidad en la unidad de medida del insumo.
 * @param factor Cuántas unidades base entran en una unidad de compra.
 * @returns Unidades de compra enteras, o null si el factor no es convertible.
 */
export function convertirAUnidadCompra(
  cantidadBase: number,
  factor: number | null,
): number | null {
  if (factor === null || !Number.isFinite(factor) || factor <= 0) return null;
  if (!Number.isFinite(cantidadBase) || cantidadBase <= 0) return 0;
  return Math.ceil(cantidadBase / factor - 1e-9);
}

/**
 * Calcula el subtotal de una linea de presupuesto.
 *
 * @param cantidad Cantidad total medida.
 * @param precioUnitario Precio unitario aplicado a la cantidad.
 * @returns El resultado de multiplicar cantidad por precio unitario.
 */
export function calcularSubtotalLinea(
  cantidad: number,
  precioUnitario: number,
): number {
  return cantidad * precioUnitario;
}

/**
 * Calcula los totales generales del presupuesto a partir de sus lineas y porcentajes.
 *
 * La cascada es acumulativa: cada capa se aplica sobre el subtotal ya inflado
 * por las capas anteriores, en este orden: gastos generales, costo financiero,
 * beneficio, impuestos.
 *
 * @param lineas Lineas del presupuesto ya calculadas.
 * @param porcentajeGastosGenerales Porcentaje de gastos generales aplicado sobre el subtotal.
 * @param porcentajeCostoFinanciero Porcentaje de costo financiero aplicado sobre subtotal mas gastos generales.
 * @param porcentajeBeneficio Porcentaje de beneficio aplicado sobre subtotal, gastos generales y costo financiero.
 * @param porcentajeImpuestos Porcentaje de impuestos aplicado sobre subtotal, gastos generales, costo financiero y beneficio.
 * @returns Un objeto con subtotal, gastos_generales, costo_financiero, beneficio, impuestos, total y coeficiente de impactación.
 */
export function calcularTotalesPresupuesto(
  lineas: PresupuestoLinea[],
  porcentajeGastosGenerales: number,
  porcentajeCostoFinanciero: number,
  porcentajeBeneficio: number,
  porcentajeImpuestos: number,
) {
  const subtotal = lineas.reduce((total, linea) => total + linea.subtotal, 0);

  const gastos_generales = aplicarPorcentaje(subtotal, porcentajeGastosGenerales);
  const sub1 = subtotal + gastos_generales;

  const costo_financiero = aplicarPorcentaje(sub1, porcentajeCostoFinanciero);
  const sub2 = sub1 + costo_financiero;

  const beneficio = aplicarPorcentaje(sub2, porcentajeBeneficio);
  const sub3 = sub2 + beneficio;

  const impuestos = aplicarPorcentaje(sub3, porcentajeImpuestos);
  const total = sub3 + impuestos;

  const coeficiente = subtotal > 0 ? total / subtotal : 0;

  return {
    subtotal,
    gastos_generales,
    costo_financiero,
    beneficio,
    impuestos,
    total,
    coeficiente,
  };
}

/* ─── Paquete Empresario ───────────────────────────────────────────────────── */

/**
 * Calcula el total de una línea de gastos generales.
 * Mensual: monto × meses (meses ausente se toma como 0). Único: monto.
 */
export function calcularTotalGasto(gasto: GastoGeneral): number {
  if (gasto.modalidad === "mensual") {
    return gasto.monto * (gasto.meses ?? 0);
  }
  return gasto.monto;
}

/**
 * Resume los gastos generales de una obra: cada línea con su total, el total
 * general y el porcentaje que representan sobre el costo directo (costo_costo).
 *
 * @param gastos Filas de gastos_generales de la obra.
 * @param costoCosto Costo directo total, usado como base del porcentaje derivado.
 */
export function resumirGastosGenerales(
  gastos: GastoGeneral[],
  costoCosto: number,
): GastosGeneralesResumen {
  const lista: GastoGeneralCalculado[] = gastos.map((gasto) => ({
    ...gasto,
    total: calcularTotalGasto(gasto),
  }));

  const total = lista.reduce((suma, gasto) => suma + gasto.total, 0);
  const porcentaje_derivado = costoCosto > 0 ? (total / costoCosto) * 100 : 0;

  return { lista, total, porcentaje_derivado };
}

/**
 * Cascada del cierre empresario. Cada porcentaje se aplica sobre el subtotal
 * acumulado inmediatamente anterior, nunca sobre el costo_costo:
 *
 *   subtotal_1 = costo_costo + gastos_generales
 *   costo financiero = subtotal_1 × cf%      → subtotal_2
 *   beneficio        = subtotal_2 × ben%     → subtotal_3
 *   impuestos        = subtotal_3 × (iva% + rentas%)
 *   precio_final     = subtotal_3 + impuestos
 *   coeficiente      = precio_final / costo_costo
 *
 * @param costoCosto Costo directo total.
 * @param totalGastosGenerales Total de gastos generales ya sumado.
 * @param paquete Porcentajes del cierre (enteros de porcentaje: 5 = 5%).
 */
export function calcularCierrePresupuesto(
  costoCosto: number,
  totalGastosGenerales: number,
  paquete: Pick<PaqueteEmpresario, "costo_financiero" | "beneficio" | "iva" | "rentas">,
): CierrePresupuesto {
  const costo_financiero_pct = Number(paquete.costo_financiero);
  const beneficio_pct = Number(paquete.beneficio);
  const iva_pct = Number(paquete.iva);
  const rentas_pct = Number(paquete.rentas);

  const subtotal_1 = costoCosto + totalGastosGenerales;

  const costo_financiero_monto = aplicarPorcentaje(subtotal_1, costo_financiero_pct);
  const subtotal_2 = subtotal_1 + costo_financiero_monto;

  const beneficio_monto = aplicarPorcentaje(subtotal_2, beneficio_pct);
  const subtotal_3 = subtotal_2 + beneficio_monto;

  const impuestos_monto = aplicarPorcentaje(subtotal_3, iva_pct + rentas_pct);
  const precio_final = subtotal_3 + impuestos_monto;

  const coeficiente = costoCosto > 0 ? precio_final / costoCosto : 0;

  return {
    costo_costo: costoCosto,
    gastos_generales: totalGastosGenerales,
    subtotal_1,
    costo_financiero_pct,
    costo_financiero_monto,
    subtotal_2,
    beneficio_pct,
    beneficio_monto,
    subtotal_3,
    impuestos: {
      iva_pct,
      rentas_pct,
      monto: impuestos_monto,
    },
    precio_final,
    coeficiente,
  };
}
