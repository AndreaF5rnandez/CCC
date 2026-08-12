// Registro de compras de materiales y control de desvío de PRECIO.
//
// Hermano del desvío de cantidad que resuelve lib/certificacion.ts: allá se
// compara cuánto material se usó contra cuánto preveían las recetas; acá se
// compara cuánto se pagó contra el precio presupuestado del insumo.
//
// El punto fino de todo el módulo es la unidad. El precio presupuestado
// (`insumos.precio_unitario`) está en unidad BASE ($/kg); lo que el encargado
// carga está en unidad de COMPRA ($/bolsa). Compararlos crudos daría un desvío
// de +2400%. La conversión usa `resolverCompra`, exactamente la misma que la
// explosión de insumos y la certificación, para que los números de las tres
// pantallas coincidan.

// Solo se usa para tipar el cliente: import type para no arrastrar next/headers
// al runtime de quien importe las funciones puras de este módulo.
import type { createSupabaseServerClient } from "./supabaseServer";
import { metadatosInsumo, resolverCompra } from "./calculos";
import { cargarOverridesCompra, type OverrideCompra } from "./compra";
// El orden por tipo y nombre es el mismo que usa el desvío de certificación.
import { ordenarPorTipoYNombre } from "./certificacion";
import { validarFechaISO } from "./fecha";
import type {
  Compra,
  CompraConDesvio,
  CompraConsolidadaInsumo,
  DesvioPrecio,
  Insumo,
} from "../types";

type SupabaseServer = ReturnType<typeof createSupabaseServerClient>;

/* ─── Cálculo del desvío de precio (puro) ──────────────────────────────────── */

/**
 * Lleva el precio presupuestado del insumo a la unidad de COMPRA.
 *
 *   precio_previsto_compra = precio_unitario × factor_compra
 *   (6,15 $/kg × 25 kg/bolsa = 153,75 $/bolsa)
 *
 * Sin factor configurado, el insumo se compra en su propia unidad base: el
 * factor implícito es 1 y el previsto es el precio base tal cual. Ese caso no
 * es un error ni un dato faltante, es la mayoría de los insumos.
 *
 * @param precioBase `insumos.precio_unitario`, en unidad base.
 * @param factorCompra Factor vigente en la obra, o null si no hay conversión.
 */
export function precioPrevistoEnUnidadCompra(
  precioBase: number,
  factorCompra: number | null,
): number {
  const precio = Number(precioBase);
  if (!Number.isFinite(precio)) return 0;
  return factorCompra === null ? precio : precio * factorCompra;
}

/**
 * Compara lo pagado contra lo previsto. Los dos tienen que venir ya en la misma
 * unidad: quien llama resuelve la conversión antes.
 *
 * Con previsto 0 (insumo sin precio presupuestado cargado) no se divide: el
 * porcentaje queda en null y la vista lo muestra como no calculable, igual que
 * hace el desvío de cantidad cuando el previsto es 0. La diferencia absoluta sí
 * se informa, porque tiene sentido: es todo lo pagado.
 */
export function calcularDesvioPrecio(
  precioPagado: number,
  precioPrevisto: number,
): DesvioPrecio {
  const desvio = precioPagado - precioPrevisto;
  return {
    precio_previsto_compra: precioPrevisto,
    desvio_precio: desvio,
    desvio_pct: precioPrevisto > 0 ? (desvio / precioPrevisto) * 100 : null,
  };
}

/**
 * Consolida las compras de una obra por insumo.
 *
 * El precio real es el promedio PONDERADO por cantidad:
 *
 *   precio_promedio_compra = Σ(cantidad × precio) / Σ(cantidad)
 *
 * y no el promedio simple: 100 bolsas a $150 y 5 bolsas a $400 dan $161,90, no
 * $275. Como el numerador es el gasto total, el ponderado sale de dividir dos
 * números que ya hacen falta para la respuesta.
 *
 * Es pura: recibe las compras ya resueltas, así el listado y el consolidado
 * salen de una sola pasada por los mismos datos y no pueden discrepar.
 *
 * @param compras Compras de la obra, con insumo y conversión ya resueltos.
 */
export function consolidarComprasPorInsumo(
  compras: CompraConDesvio[],
): CompraConsolidadaInsumo[] {
  const porInsumo = new Map<string, CompraConsolidadaInsumo>();
  // Para el caso degenerado de cantidad total 0, donde el ponderado no existe.
  const sumaPreciosSimple = new Map<string, number>();

  for (const compra of compras) {
    const acumulado = porInsumo.get(compra.insumo_id);

    if (acumulado) {
      acumulado.cantidad_compras += 1;
      acumulado.cantidad_total += compra.cantidad;
      acumulado.gasto_total += compra.gasto;
    } else {
      porInsumo.set(compra.insumo_id, {
        insumo_id: compra.insumo_id,
        nombre: compra.nombre,
        unidad_medida: compra.unidad_medida,
        tipo: compra.tipo,
        precio_unitario: compra.precio_unitario,
        unidad_compra: compra.unidad_compra,
        factor_compra: compra.factor_compra,
        factor_origen: compra.factor_origen,
        factor_referencia: compra.factor_referencia,
        cantidad_compras: 1,
        cantidad_total: compra.cantidad,
        gasto_total: compra.gasto,
        // Se completan abajo, cuando están todas las compras del insumo.
        gasto_previsto: 0,
        desvio_gasto: 0,
        precio_promedio_compra: 0,
        precio_previsto_compra: compra.precio_previsto_compra,
        desvio_precio: 0,
        desvio_pct: null,
      });
    }

    sumaPreciosSimple.set(
      compra.insumo_id,
      (sumaPreciosSimple.get(compra.insumo_id) ?? 0) +
        compra.precio_unitario_compra,
    );
  }

  for (const fila of porInsumo.values()) {
    fila.precio_promedio_compra =
      fila.cantidad_total > 0
        ? fila.gasto_total / fila.cantidad_total
        : // Todas las compras con cantidad 0: el ponderado no está definido
          // (dividir por cero) y mostrar $0 diría que el material salió gratis.
          // Se cae al promedio simple de los precios cargados.
          (sumaPreciosSimple.get(fila.insumo_id) ?? 0) / fila.cantidad_compras;

    const desvio = calcularDesvioPrecio(
      fila.precio_promedio_compra,
      fila.precio_previsto_compra,
    );
    fila.desvio_precio = desvio.desvio_precio;
    fila.desvio_pct = desvio.desvio_pct;

    fila.gasto_previsto = fila.cantidad_total * fila.precio_previsto_compra;
    fila.desvio_gasto = fila.gasto_total - fila.gasto_previsto;
  }

  return Array.from(porInsumo.values()).sort(ordenarPorTipoYNombre);
}

/* ─── Lectura ──────────────────────────────────────────────────────────────── */

// Shape crudo de PostgREST: la compra con su insumo anidado.
type CompraRaw = Compra & { insumo: Insumo | null };

const COMPRA_SELECT = `
  id,
  obra_id,
  insumo_id,
  fecha,
  cantidad,
  precio_unitario_compra,
  proveedor,
  created_at,
  updated_at,
  insumo:insumos (*)
`;

/**
 * Mensaje claro cuando falta correr la migración 013.
 *
 * A diferencia de la certificación, acá no hay comportamiento previo al que
 * degradar: sin la tabla no hay registro de compras. Lo único que se puede
 * hacer es no devolver un "relation does not exist" crudo a la pantalla.
 *
 * @returns El mensaje listo para tirar, o null si el error es otro.
 */
export function mensajeSiFaltaTablaCompras(error: {
  code?: string;
} | null): string | null {
  // Dos códigos para la misma causa: PostgREST responde PGRST205 cuando la
  // tabla no está en su schema cache (es lo que devuelve Supabase hoy), y
  // 42P01 es el error de Postgres si la consulta llega igual a la base.
  if (!error || (error.code !== "42P01" && error.code !== "PGRST205")) {
    return null;
  }
  return (
    "Falta la tabla compras: ejecutá supabase/migrations/013_compras.sql " +
    "en el SQL Editor de Supabase."
  );
}

/**
 * Trae compras con el insumo resuelto, la conversión de la obra y su desvío.
 *
 * Los overrides de compra se cargan una vez por obra, no una por compra: con el
 * filtro por obra es una sola consulta extra, y por id son dos en total.
 *
 * @param supabase Cliente de servidor (el RLS filtra por usuario).
 * @param filtro Por obra (listado) o por id (una sola compra).
 */
export async function cargarComprasConDesvio(
  supabase: SupabaseServer,
  filtro: { obraId: string } | { id: string },
): Promise<CompraConDesvio[]> {
  let query = supabase.from("compras").select(COMPRA_SELECT);

  query =
    "obraId" in filtro
      ? query.eq("obra_id", filtro.obraId)
      : query.eq("id", filtro.id);

  // Orden cronológico y, dentro del día, por orden de carga: es un registro de
  // compras, se lee como un libro diario. Mismo criterio que certificaciones.
  const { data, error } = await query
    .order("fecha", { ascending: true })
    .order("created_at", { ascending: true });

  const faltaTabla = mensajeSiFaltaTablaCompras(error);
  if (faltaTabla) throw new Error(faltaTabla);
  if (error) throw error;

  const filas = (data ?? []) as unknown as CompraRaw[];
  if (filas.length === 0) return [];

  // Un mapa de overrides por obra: con el filtro por obra es siempre uno solo.
  const overridesPorObra = new Map<string, Map<string, OverrideCompra>>();
  for (const obraId of new Set(filas.map((fila) => fila.obra_id))) {
    overridesPorObra.set(
      obraId,
      await cargarOverridesCompra(supabase, obraId, "compras"),
    );
  }

  return filas
    .filter((fila): fila is CompraRaw & { insumo: Insumo } => {
      // La FK es NOT NULL con CASCADE, así que esto no debería pasar nunca:
      // si pasa, es preferible saltear la fila a romper todo el listado.
      if (fila.insumo) return true;
      console.warn(`[compras] La compra ${fila.id} no resolvió su insumo.`);
      return false;
    })
    .map((fila) => {
      const overrides = overridesPorObra.get(fila.obra_id) ?? new Map();
      // Misma resolución referencia/override que la explosión y el previsto.
      const compraResuelta = resolverCompra(
        fila.insumo,
        overrides.get(fila.insumo_id) ?? null,
      );

      const metadatos = metadatosInsumo(fila.insumo);
      // PostgREST devuelve los numeric como string: se normalizan una sola vez.
      const cantidad = Number(fila.cantidad);
      const precioPagado = Number(fila.precio_unitario_compra);

      const desvio = calcularDesvioPrecio(
        precioPagado,
        precioPrevistoEnUnidadCompra(
          metadatos.precio_unitario,
          compraResuelta.factor_compra,
        ),
      );

      return {
        id: fila.id,
        obra_id: fila.obra_id,
        fecha: fila.fecha,
        cantidad,
        precio_unitario_compra: precioPagado,
        proveedor: fila.proveedor,
        created_at: fila.created_at,
        updated_at: fila.updated_at,
        ...metadatos,
        ...compraResuelta,
        ...desvio,
        gasto: cantidad * precioPagado,
      };
    });
}

/* ─── Validación del payload (compartida por POST y PUT) ───────────────────── */

/** Payload ya normalizado: fecha limpia, números convertidos, proveedor trim. */
export interface PayloadCompra {
  insumo_id: string;
  fecha: string;
  cantidad: number;
  precio_unitario_compra: number;
  proveedor: string | null;
}

export type ResultadoValidacionCompra =
  | { ok: true; datos: PayloadCompra }
  | { ok: false; error: string };

/**
 * Valida y normaliza el cuerpo de una compra.
 *
 * Los mensajes salen tal cual a la pantalla, así que nombran el campo concreto.
 * No valida que el insumo exista ni que la obra sea del usuario: eso necesita ir
 * a la base y lo hace el route handler.
 *
 * @param body Cuerpo crudo del request.
 * @param obligarObraId true en POST (la obra viene en el body); false en PUT,
 *   donde la obra es la que ya tiene la compra y no se puede cambiar.
 */
export function validarPayloadCompra(
  body: unknown,
  obligarObraId: boolean,
): ResultadoValidacionCompra {
  const payload = (body ?? {}) as {
    obra_id?: unknown;
    insumo_id?: unknown;
    fecha?: unknown;
    cantidad?: unknown;
    precio_unitario_compra?: unknown;
    proveedor?: unknown;
  };

  if (obligarObraId) {
    if (typeof payload.obra_id !== "string" || payload.obra_id.trim() === "") {
      return { ok: false, error: "El obra_id es obligatorio" };
    }
  }

  if (typeof payload.insumo_id !== "string" || payload.insumo_id.trim() === "") {
    return { ok: false, error: "Hay que elegir un insumo" };
  }

  // Fecha libre (la elige el encargado), pero tiene que ser un día que exista.
  const fecha = validarFechaISO(payload.fecha);
  if (!fecha.ok) return { ok: false, error: fecha.error };

  const cantidad = numeroNoNegativo(payload.cantidad);
  if (cantidad === null) {
    return {
      ok: false,
      error: "La cantidad comprada tiene que ser un número mayor o igual a 0",
    };
  }

  const precio = numeroNoNegativo(payload.precio_unitario_compra);
  if (precio === null) {
    return {
      ok: false,
      error: "El precio pagado tiene que ser un número mayor o igual a 0",
    };
  }

  if (
    payload.proveedor !== undefined &&
    payload.proveedor !== null &&
    typeof payload.proveedor !== "string"
  ) {
    return { ok: false, error: "El proveedor tiene que ser texto" };
  }
  const proveedor =
    typeof payload.proveedor === "string" && payload.proveedor.trim() !== ""
      ? payload.proveedor.trim()
      : null;

  return {
    ok: true,
    datos: {
      insumo_id: payload.insumo_id,
      fecha: fecha.fecha,
      cantidad,
      precio_unitario_compra: precio,
      proveedor,
    },
  };
}

/** Número finito y no negativo, o null si el valor no sirve.
 *  El 0 se acepta: una compra bonificada o una carga a completar después. */
function numeroNoNegativo(valor: unknown): number | null {
  if (valor === undefined || valor === null || valor === "") return null;
  const numero = Number(valor);
  return Number.isFinite(numero) && numero >= 0 ? numero : null;
}

/** ¿Existe el insumo (y es del usuario)? El RLS de `insumos` ya filtra por
 *  usuario, así que un insumo ajeno cae como inexistente, que es la respuesta
 *  correcta desde afuera. */
export async function existeInsumo(
  supabase: SupabaseServer,
  insumoId: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from("insumos")
    .select("id")
    .eq("id", insumoId)
    .maybeSingle();

  if (error) throw error;
  return data !== null;
}
