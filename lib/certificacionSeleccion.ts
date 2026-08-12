import type {
  CertificacionItemDisponible,
  CertificacionItemEjecutado,
  CertificacionRubroDisponible,
} from "../types";

/**
 * Selección a nivel medición de la vista de Registrar.
 *
 * En obra no se ejecuta el ítem completo de una: se hacen paredes sueltas en
 * distintos momentos. Por eso se tilda medición por medición, y el ítem es un
 * atajo para tildarlas todas.
 *
 * Es lógica pura, fuera del componente, para poder razonarla y probarla sin
 * montar React.
 */
export interface Seleccion {
  /** Ids de medición tildados. */
  mediciones: Set<string>;
  /** Ítems sin ninguna medición cargada: se tildan enteros porque no tienen
   *  nada que desplegar. */
  itemsSinMedicion: Set<string>;
}

export const SELECCION_VACIA: Seleccion = {
  mediciones: new Set(),
  itemsSinMedicion: new Set(),
};

export type EstadoTilde = "todas" | "algunas" | "ninguna";

/** Estado del checkbox de un ítem según cuántas de sus mediciones estén tildadas. */
export function estadoDelItem(
  item: CertificacionItemDisponible,
  sel: Seleccion,
): EstadoTilde {
  if (item.mediciones.length === 0) {
    return sel.itemsSinMedicion.has(item.item_id) ? "todas" : "ninguna";
  }
  const tildadas = item.mediciones.filter((m) => sel.mediciones.has(m.id)).length;
  if (tildadas === 0) return "ninguna";
  return tildadas === item.mediciones.length ? "todas" : "algunas";
}

/** Estado del checkbox de un rubro, derivado del de sus ítems. */
export function estadoDelRubro(
  rubro: CertificacionRubroDisponible,
  sel: Seleccion,
): EstadoTilde {
  const estados = rubro.items.map((item) => estadoDelItem(item, sel));
  if (estados.length === 0 || estados.every((e) => e === "ninguna")) return "ninguna";
  return estados.every((e) => e === "todas") ? "todas" : "algunas";
}

/**
 * Cantidad ejecutada de un ítem = suma de las `cantidad_calculada` de sus
 * mediciones tildadas. Un ítem sin mediciones aporta su cantidad total, que
 * puede ser 0.
 */
export function cantidadEjecutada(
  item: CertificacionItemDisponible,
  sel: Seleccion,
): number {
  if (item.mediciones.length === 0) return item.cantidad_total;
  return item.mediciones
    .filter((m) => sel.mediciones.has(m.id))
    .reduce((suma, m) => suma + m.cantidad_calculada, 0);
}

/**
 * Traduce la selección al payload del endpoint de previsto.
 *
 * Por cada ítem con algo tildado va la SUMA de sus mediciones seleccionadas
 * como `cantidad_ejecutada`. El backend ya calcula el previsto proporcional a
 * esa cantidad: acá no se recalcula nada.
 *
 * Los ítems sin mediciones van sin cantidad, para que el backend use el total
 * (y se guarden como "ítem completo").
 */
export function itemsEjecutados(
  rubros: CertificacionRubroDisponible[],
  sel: Seleccion,
): CertificacionItemEjecutado[] {
  const lista: CertificacionItemEjecutado[] = [];
  for (const rubro of rubros) {
    for (const item of rubro.items) {
      if (estadoDelItem(item, sel) === "ninguna") continue;
      if (item.mediciones.length === 0) {
        lista.push({ item_id: item.item_id });
      } else {
        lista.push({
          item_id: item.item_id,
          cantidad_ejecutada: cantidadEjecutada(item, sel),
        });
      }
    }
  }
  return lista;
}

/** Tilda o destilda todas las mediciones de un ítem. Parcial cuenta como
 *  "no todas": el click completa la selección. */
export function alternarItemEn(
  item: CertificacionItemDisponible,
  sel: Seleccion,
): Seleccion {
  const prender = estadoDelItem(item, sel) !== "todas";

  if (item.mediciones.length === 0) {
    const itemsSinMedicion = new Set(sel.itemsSinMedicion);
    if (prender) itemsSinMedicion.add(item.item_id);
    else itemsSinMedicion.delete(item.item_id);
    return { ...sel, itemsSinMedicion };
  }

  const mediciones = new Set(sel.mediciones);
  for (const m of item.mediciones) {
    if (prender) mediciones.add(m.id);
    else mediciones.delete(m.id);
  }
  return { ...sel, mediciones };
}

/** Tilda o destilda todos los ítems de un rubro. */
export function alternarRubroEn(
  rubro: CertificacionRubroDisponible,
  sel: Seleccion,
): Seleccion {
  const prender = rubro.items.some((item) => estadoDelItem(item, sel) !== "todas");
  const mediciones = new Set(sel.mediciones);
  const itemsSinMedicion = new Set(sel.itemsSinMedicion);

  for (const item of rubro.items) {
    if (item.mediciones.length === 0) {
      if (prender) itemsSinMedicion.add(item.item_id);
      else itemsSinMedicion.delete(item.item_id);
      continue;
    }
    for (const m of item.mediciones) {
      if (prender) mediciones.add(m.id);
      else mediciones.delete(m.id);
    }
  }
  return { mediciones, itemsSinMedicion };
}

/** Tilda o destilda una medición suelta. */
export function alternarMedicionEn(medicionId: string, sel: Seleccion): Seleccion {
  const mediciones = new Set(sel.mediciones);
  if (mediciones.has(medicionId)) mediciones.delete(medicionId);
  else mediciones.add(medicionId);
  return { ...sel, mediciones };
}
