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

/**
 * Qué mediciones se pueden certificar ahora.
 *
 * Una medición ya certificada en otra certificación no se ofrece de nuevo, para
 * no duplicar por error. "Reabrir" es un gesto deliberado del encargado para
 * corregir: la devuelve al conjunto disponible.
 */
export interface Disponibilidad {
  /** Mediciones ya certificadas en certificaciones anteriores. */
  certificadas: Set<string>;
  /** Reabiertas a mano para corregir: vuelven a estar disponibles. */
  reabiertas: Set<string>;
}

export const SIN_CERTIFICAR: Disponibilidad = {
  certificadas: new Set(),
  reabiertas: new Set(),
};

/** ¿Se puede tildar esta medición? */
export function estaDisponible(medicionId: string, disp: Disponibilidad): boolean {
  return !disp.certificadas.has(medicionId) || disp.reabiertas.has(medicionId);
}

/** Mediciones del ítem que se pueden tildar ahora. */
export function medicionesDisponibles(
  item: CertificacionItemDisponible,
  disp: Disponibilidad,
) {
  return item.mediciones.filter((m) => estaDisponible(m.id, disp));
}

/** Cuántas mediciones del ítem ya se certificaron (para el indicador de avance). */
export function certificadasDelItem(
  item: CertificacionItemDisponible,
  disp: Disponibilidad,
): number {
  return item.mediciones.filter((m) => disp.certificadas.has(m.id)).length;
}

/** true si todas las mediciones del ítem ya se certificaron y ninguna se reabrió.
 *  El ítem se muestra atenuado, pero no se oculta: es avance a la vista. */
export function itemCompletamenteCertificado(
  item: CertificacionItemDisponible,
  disp: Disponibilidad,
): boolean {
  return (
    item.mediciones.length > 0 &&
    medicionesDisponibles(item, disp).length === 0
  );
}

/**
 * Estado del checkbox de un ítem.
 *
 * Se mide contra las mediciones DISPONIBLES, no contra todas: si de 11 paredes
 * 3 ya están certificadas, tildar las 8 restantes deja el ítem en "todas". Si
 * contara las 11, el checkbox nunca se llenaría y "tildar todo" intentaría
 * recertificar lo ya hecho.
 */
export function estadoDelItem(
  item: CertificacionItemDisponible,
  sel: Seleccion,
  disp: Disponibilidad = SIN_CERTIFICAR,
): EstadoTilde {
  if (item.mediciones.length === 0) {
    return sel.itemsSinMedicion.has(item.item_id) ? "todas" : "ninguna";
  }

  const disponibles = medicionesDisponibles(item, disp);
  // Sin nada disponible no hay nada que tildar: cuenta como "ninguna".
  if (disponibles.length === 0) return "ninguna";

  const tildadas = disponibles.filter((m) => sel.mediciones.has(m.id)).length;
  if (tildadas === 0) return "ninguna";
  return tildadas === disponibles.length ? "todas" : "algunas";
}

/** Estado del checkbox de un rubro, derivado del de sus ítems.
 *  Los ítems completamente certificados no cuentan: no hay nada que tildar. */
export function estadoDelRubro(
  rubro: CertificacionRubroDisponible,
  sel: Seleccion,
  disp: Disponibilidad = SIN_CERTIFICAR,
): EstadoTilde {
  const estados = rubro.items
    .filter((item) => !itemCompletamenteCertificado(item, disp))
    .map((item) => estadoDelItem(item, sel, disp));
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
  disp: Disponibilidad = SIN_CERTIFICAR,
): CertificacionItemEjecutado[] {
  const lista: CertificacionItemEjecutado[] = [];
  for (const rubro of rubros) {
    for (const item of rubro.items) {
      if (estadoDelItem(item, sel, disp) === "ninguna") continue;
      if (item.mediciones.length === 0) {
        lista.push({ item_id: item.item_id });
      } else {
        lista.push({
          item_id: item.item_id,
          cantidad_ejecutada: cantidadEjecutada(item, sel),
          // Qué paredes se ejecutaron, para no volver a ofrecerlas.
          medicion_ids: item.mediciones
            .filter((m) => sel.mediciones.has(m.id))
            .map((m) => m.id),
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
  disp: Disponibilidad = SIN_CERTIFICAR,
): Seleccion {
  const prender = estadoDelItem(item, sel, disp) !== "todas";

  if (item.mediciones.length === 0) {
    const itemsSinMedicion = new Set(sel.itemsSinMedicion);
    if (prender) itemsSinMedicion.add(item.item_id);
    else itemsSinMedicion.delete(item.item_id);
    return { ...sel, itemsSinMedicion };
  }

  const mediciones = new Set(sel.mediciones);
  // Solo las disponibles: "tildar todo" no puede recertificar lo ya hecho.
  for (const m of medicionesDisponibles(item, disp)) {
    if (prender) mediciones.add(m.id);
    else mediciones.delete(m.id);
  }
  return { ...sel, mediciones };
}

/** Tilda o destilda todos los ítems de un rubro, salvo los ya certificados. */
export function alternarRubroEn(
  rubro: CertificacionRubroDisponible,
  sel: Seleccion,
  disp: Disponibilidad = SIN_CERTIFICAR,
): Seleccion {
  const pendientes = rubro.items.filter(
    (item) => !itemCompletamenteCertificado(item, disp),
  );
  const prender = pendientes.some(
    (item) => estadoDelItem(item, sel, disp) !== "todas",
  );
  const mediciones = new Set(sel.mediciones);
  const itemsSinMedicion = new Set(sel.itemsSinMedicion);

  for (const item of pendientes) {
    if (item.mediciones.length === 0) {
      if (prender) itemsSinMedicion.add(item.item_id);
      else itemsSinMedicion.delete(item.item_id);
      continue;
    }
    for (const m of medicionesDisponibles(item, disp)) {
      if (prender) mediciones.add(m.id);
      else mediciones.delete(m.id);
    }
  }
  return { mediciones, itemsSinMedicion };
}

/** Reabre una medición ya certificada para poder corregirla. Gesto deliberado:
 *  no se dispara al tildar ni al usar los atajos de ítem o rubro. */
export function reabrirMedicionEn(medicionId: string, disp: Disponibilidad): Disponibilidad {
  const reabiertas = new Set(disp.reabiertas);
  reabiertas.add(medicionId);
  return { ...disp, reabiertas };
}

/** Tilda o destilda una medición suelta. */
export function alternarMedicionEn(medicionId: string, sel: Seleccion): Seleccion {
  const mediciones = new Set(sel.mediciones);
  if (mediciones.has(medicionId)) mediciones.delete(medicionId);
  else mediciones.add(medicionId);
  return { ...sel, mediciones };
}
