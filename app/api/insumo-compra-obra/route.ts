import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { resolverCompra } from "@/lib/calculos";
import { loguearError } from "@/lib/apiError";
import type { InsumoCompraObraResponse } from "@/types";

// POST /api/insumo-compra-obra
//
// Guarda (o borra) el override del factor de compra de un insumo en UNA obra.
// Nunca toca la referencia del insumo: cambiar el factor acá no afecta a las
// demás obras. Upsert sobre (obra_id, insumo_id); factor null o <= 0 borra el
// override y el insumo vuelve a usar la referencia.
//
// Body: { obra_id, insumo_id, factor_compra: number | null, unidad_compra?: string | null }
// Devuelve la conversión ya resuelta después del cambio, para que la vista la
// aplique sin recalcular la precedencia.
export async function POST(request: NextRequest) {
  try {
    const supabase = createSupabaseServerClient();
    const body: unknown = await request.json();
    const { obra_id, insumo_id, factor_compra, unidad_compra } = body as {
      obra_id?: string;
      insumo_id?: string;
      factor_compra?: number | null;
      unidad_compra?: string | null;
    };

    // ── Validaciones ────────────────────────────────────────────────
    if (!obra_id || obra_id.trim() === "") {
      return NextResponse.json(
        { error: "El obra_id es obligatorio" },
        { status: 400 },
      );
    }

    if (!insumo_id || insumo_id.trim() === "") {
      return NextResponse.json(
        { error: "El insumo_id es obligatorio" },
        { status: 400 },
      );
    }

    // La referencia del insumo hace falta en los dos caminos: para heredar la
    // unidad de compra al guardar, y para saber a qué valor se vuelve al borrar.
    const { data: insumo, error: insumoError } = await supabase
      .from("insumos")
      .select("id, unidad_compra, factor_compra")
      .eq("id", insumo_id)
      .single();

    if (insumoError || !insumo) {
      return NextResponse.json({ error: "Insumo no encontrado" }, { status: 404 });
    }

    const unidadLimpia =
      typeof unidad_compra === "string" && unidad_compra.trim() !== ""
        ? unidad_compra.trim()
        : null;

    // ── Sin factor válido: borrar el override y volver a la referencia ──
    if (
      factor_compra === undefined ||
      factor_compra === null ||
      typeof factor_compra !== "number" ||
      !Number.isFinite(factor_compra) ||
      factor_compra <= 0
    ) {
      // Un factor mal escrito no puede borrar un override silenciosamente:
      // solo el vacío explícito (null/undefined) significa "volver a la referencia".
      if (factor_compra !== undefined && factor_compra !== null) {
        return NextResponse.json(
          { error: "El factor de compra debe ser un número mayor a 0" },
          { status: 400 },
        );
      }

      const { error: deleteError } = await supabase
        .from("insumo_compra_obra")
        .delete()
        .eq("obra_id", obra_id)
        .eq("insumo_id", insumo_id);

      if (deleteError) throw deleteError;

      const respuesta: InsumoCompraObraResponse = {
        insumo_id,
        ...resolverCompra(insumo, null),
      };
      return NextResponse.json(respuesta, { status: 200 });
    }

    // ── Upsert usando la restricción UNIQUE (obra_id, insumo_id) ────────
    const { data, error } = await supabase
      .from("insumo_compra_obra")
      .upsert(
        {
          obra_id,
          insumo_id,
          factor_compra,
          unidad_compra: unidadLimpia,
        },
        { onConflict: "obra_id,insumo_id" },
      )
      .select("insumo_id, factor_compra, unidad_compra")
      .single();

    if (error) throw error;

    if (!data) {
      return NextResponse.json(
        { error: "No se pudo guardar el factor de compra" },
        { status: 500 },
      );
    }

    const respuesta: InsumoCompraObraResponse = {
      insumo_id,
      ...resolverCompra(insumo, data),
    };
    return NextResponse.json(respuesta, { status: 200 });
  } catch (error) {
    const mensaje = loguearError("POST /api/insumo-compra-obra", error);
    return NextResponse.json({ error: mensaje }, { status: 500 });
  }
}
