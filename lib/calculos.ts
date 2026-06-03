import type {
  MedicionConReceta,
  PresupuestoLinea,
  RecetaConInsumos,
} from "../types";

function aplicarPorcentaje(base: number, porcentaje: number): number {
  return base * (porcentaje / 100);
}

function obtenerPrecioUnitarioReceta(receta: MedicionConReceta["receta"]): number {
  if ("precio_unitario" in receta && typeof receta.precio_unitario === "number") {
    return receta.precio_unitario;
  }

  if ("ingredientes" in receta && Array.isArray(receta.ingredientes)) {
    return calcularPrecioReceta(receta.ingredientes as RecetaConInsumos["ingredientes"]);
  }

  return 0;
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
    return total + ingrediente.cantidad * ingrediente.insumo.precio;
  }, 0);
}

/**
 * Calcula la cantidad de una medicion multiplicando las dimensiones disponibles.
 *
 * @param dim1 Primera dimension obligatoria.
 * @param dim2 Segunda dimension opcional.
 * @param dim3 Tercera dimension opcional.
 * @returns La cantidad calculada segun las dimensiones informadas.
 */
export function calcularCantidadMedicion(
  dim1: number,
  dim2?: number,
  dim3?: number,
): number {
  if (typeof dim2 !== "number") {
    return dim1;
  }

  if (typeof dim3 !== "number") {
    return dim1 * dim2;
  }

  return dim1 * dim2 * dim3;
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
 * @param lineas Lineas del presupuesto ya calculadas.
 * @param porcentajeGastosGenerales Porcentaje de gastos generales, por ejemplo 10 para 10%.
 * @param porcentajeBeneficio Porcentaje de beneficio aplicado sobre subtotal mas gastos generales.
 * @param porcentajeImpuestos Porcentaje de impuestos aplicado sobre subtotal, gastos generales y beneficio.
 * @returns Un objeto con subtotal, gastos_generales, beneficio, impuestos y total final.
 */
export function calcularTotalesPresupuesto(
  lineas: PresupuestoLinea[],
  porcentajeGastosGenerales: number,
  porcentajeBeneficio: number,
  porcentajeImpuestos: number,
) {
  const subtotal = lineas.reduce((total, linea) => total + linea.subtotal, 0);
  const gastos_generales = aplicarPorcentaje(
    subtotal,
    porcentajeGastosGenerales,
  );
  const baseBeneficio = subtotal + gastos_generales;
  const beneficio = aplicarPorcentaje(baseBeneficio, porcentajeBeneficio);
  const baseImpuestos = baseBeneficio + beneficio;
  const impuestos = aplicarPorcentaje(baseImpuestos, porcentajeImpuestos);
  const total = subtotal + gastos_generales + beneficio + impuestos;

  return {
    subtotal,
    gastos_generales,
    beneficio,
    impuestos,
    total,
  };
}

/**
 * Agrupa mediciones por receta para construir las lineas finales del presupuesto.
 *
 * @param mediciones Array de mediciones con su receta cargada.
 * @returns Un array de lineas agrupadas por receta con cantidad total, precio unitario y subtotal.
 */
export function agruparMedicionesPorReceta(
  mediciones: MedicionConReceta[],
): PresupuestoLinea[] {
  const lineasPorReceta = new Map<string, PresupuestoLinea>();

  for (const medicion of mediciones) {
    const recetaId = medicion.receta_id;
    const precioUnitario = obtenerPrecioUnitarioReceta(medicion.receta);
    const lineaExistente = lineasPorReceta.get(recetaId);

    if (lineaExistente) {
      lineaExistente.cantidad_total += medicion.cantidad_calculada;
      lineaExistente.subtotal = calcularSubtotalLinea(
        lineaExistente.cantidad_total,
        lineaExistente.precio_unitario,
      );
      continue;
    }

    lineasPorReceta.set(recetaId, {
      receta_id: recetaId,
      receta_nombre: medicion.receta.nombre,
      unidad: medicion.receta.unidad,
      cantidad_total: medicion.cantidad_calculada,
      precio_unitario: precioUnitario,
      subtotal: calcularSubtotalLinea(
        medicion.cantidad_calculada,
        precioUnitario,
      ),
    });
  }

  return Array.from(lineasPorReceta.values());
}
