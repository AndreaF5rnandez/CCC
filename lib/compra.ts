// Solo se usa para tipar el cliente: import type para no arrastrar
// next/headers al runtime de quien importe estas funciones.
import type { createSupabaseServerClient } from "./supabaseServer";
import type { InsumoCompraObra } from "../types";

type SupabaseServer = ReturnType<typeof createSupabaseServerClient>;

/** Override del factor de compra de una obra, tal como se lee de la base. */
export type OverrideCompra = Pick<
  InsumoCompraObra,
  "insumo_id" | "factor_compra" | "unidad_compra"
>;

/**
 * Overrides de compra de UNA obra, indexados por insumo.
 *
 * Los pisa `resolverCompra` sobre la referencia del insumo. Es la única carga
 * de estos overrides: la usan la explosión de insumos y la certificación, para
 * que las dos pantallas resuelvan el mismo factor y los números coincidan.
 *
 * Si la tabla todavía no existe (la migración 009 se aplica a mano y puede ir
 * por detrás del deploy) devuelve un mapa vacío y avisa: sin overrides se cae
 * a la referencia del insumo, que es peor que lo ideal pero mejor que romper.
 *
 * @param supabase Cliente de servidor (el RLS filtra por usuario).
 * @param obraId Obra de la que se leen los overrides.
 * @param contexto Nombre del endpoint, para el warning.
 */
export async function cargarOverridesCompra(
  supabase: SupabaseServer,
  obraId: string,
  contexto: string,
): Promise<Map<string, OverrideCompra>> {
  const { data, error } = await supabase
    .from("insumo_compra_obra")
    .select("insumo_id, factor_compra, unidad_compra")
    .eq("obra_id", obraId);

  // 42P01 = la tabla no existe todavía: falta correr la migración 009.
  if (error && error.code !== "42P01") throw error;
  if (error) {
    console.warn(
      `[${contexto}] Falta la tabla insumo_compra_obra: ejecutá ` +
        "supabase/migrations/009_unidad_compra.sql. " +
        "Se usa la conversión de referencia de cada insumo, sin override por obra.",
    );
    return new Map();
  }

  return new Map(
    ((data ?? []) as OverrideCompra[]).map((o) => [o.insumo_id, o]),
  );
}
