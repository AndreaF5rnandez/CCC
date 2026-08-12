// Formato y unidades de presentación, compartidos por las pantallas de obra.
//
// Nada de esto calcula: son las decisiones de cómo se muestra un número, una
// fecha o una unidad. Viven juntas para que Certificación y Compras muestren
// el mismo insumo con el mismo formato, en vez de dos redondeos distintos.

/* ─── Números y plata ──────────────────────────────────────────────────────── */

/**
 * Cantidad de material con el redondeo que corresponde a su unidad.
 *
 * Los insumos por unidad entera (ladrillos, "u") no muestran decimales: medio
 * ladrillo no existe y el decimal solo ensucia la lectura.
 */
export function formatNum(v: number, unidad: string): string {
  const enteros = unidad.trim().toLowerCase() === 'u';
  return new Intl.NumberFormat('es-AR', {
    maximumFractionDigits: enteros ? 0 : 2,
  }).format(enteros ? Math.round(v) : v);
}

/** Plata en pesos: $ 153,75. */
export function formatPrecio(v: number): string {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
  }).format(v);
}

/* Signo explícito y el mismo glifo de menos en todas las columnas de desvío:
 * Intl usa guión y quedaba desparejo al lado del menos tipográfico. */
export function conSigno(v: number, cuerpo: string): string {
  if (v > 0) return `+${cuerpo}`;
  if (v < 0) return `−${cuerpo}`;
  return cuerpo;
}

export function formatPct(v: number): string {
  const cuerpo =
    new Intl.NumberFormat('es-AR', { maximumFractionDigits: 1 }).format(Math.abs(v)) + '%';
  return conSigno(v, cuerpo);
}

export function formatDesvio(v: number, unidad: string): string {
  return conSigno(v, formatNum(Math.abs(v), unidad));
}

/** Desvío en plata, con signo: +$ 856,25. */
export function formatDesvioPrecio(v: number): string {
  return conSigno(v, formatPrecio(Math.abs(v)));
}

/* ─── Fechas ───────────────────────────────────────────────────────────────── */

export function formatFecha(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return iso;
  return new Intl.DateTimeFormat('es-AR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(Date.UTC(y, m - 1, d)));
}

export function hoyISO(): string {
  // Fecha local, no UTC: en Argentina toDateString UTC puede caer un día antes.
  const d = new Date();
  const mes = String(d.getMonth() + 1).padStart(2, '0');
  const dia = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mes}-${dia}`;
}

/* ─── Unidad de carga ──────────────────────────────────────────────────────── */

/* En obra nadie pesa el material: se cuentan bolsas, barras, rollos. Cuando el
 * insumo tiene conversión configurada, todo lo que el encargado ve y escribe va
 * en esa unidad de compra; la base queda como referencia secundaria.
 *
 * La conversión llega ya resuelta del backend (override de la obra sobre
 * referencia del insumo, la misma que usa la explosión). Acá no se decide nada
 * sobre el factor: solo se divide o se multiplica por él.
 *
 * Sin conversión configurada, el factor es 1 y todo sigue en unidad base.
 */
export interface ConUnidad {
  unidad_medida: string;
  unidad_compra: string | null;
  factor_compra: number | null;
}

export interface UnidadDeCarga {
  /** La etiqueta que se muestra y en la que se escribe. */
  unidad: string;
  /** Cuántas unidades base entran en una de carga. 1 = sin conversión. */
  factor: number;
  /** true si se está trabajando en unidad de compra, no en la base. */
  convertido: boolean;
}

export function unidadDeCarga(fila: ConUnidad): UnidadDeCarga {
  const factor = fila.factor_compra;
  if (fila.unidad_compra && factor !== null && factor > 0) {
    return { unidad: fila.unidad_compra, factor, convertido: true };
  }
  return { unidad: fila.unidad_medida, factor: 1, convertido: false };
}

/** Pluralización simple: la unidad de compra es texto libre ("bolsa", "barra"). */
export function pluralizar(cantidad: number, unidad: string): string {
  if (Math.abs(cantidad) === 1 || unidad.endsWith('s')) return unidad;
  return `${unidad}s`;
}

/** Acepta coma o punto como separador decimal; vacío devuelve null. */
export function parsearCantidad(texto: string): number | null {
  const limpio = texto.trim().replace(',', '.');
  if (limpio === '') return null;
  const n = Number(limpio);
  return Number.isFinite(n) && n >= 0 ? n : null;
}
