import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabaseServer";
import {
  cargarComprasConDesvio,
  existeInsumo,
  mensajeSiFaltaTablaCompras,
  validarPayloadCompra,
} from "@/lib/registroCompras";
import { loguearError } from "@/lib/apiError";

/**
 * GET /api/compras/[id]
 * Una compra con su insumo, la conversión de la obra y su desvío de precio
 * calculado al momento.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const supabase = createSupabaseServerClient();
    const [compra] = await cargarComprasConDesvio(supabase, { id: params.id });

    if (!compra) {
      return NextResponse.json({ error: "Compra no encontrada" }, { status: 404 });
    }

    return NextResponse.json(compra, { status: 200 });
  } catch (error) {
    const mensaje = loguearError("GET /api/compras/[id]", error);
    return NextResponse.json({ error: mensaje }, { status: 500 });
  }
}

/**
 * PUT /api/compras/[id]
 *
 * Corrige una compra: insumo, fecha, cantidad, precio o proveedor.
 *
 * La obra NO se puede cambiar. El factor de conversión con el que se calcula el
 * desvío es el de la obra, así que mover una compra a otra obra reinterpretaría
 * su precio; mismo criterio que el PUT de certificaciones.
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const supabase = createSupabaseServerClient();
    const body: unknown = await request.json();

    const validacion = validarPayloadCompra(body, false);
    if (!validacion.ok) {
      return NextResponse.json({ error: validacion.error }, { status: 400 });
    }

    const datos = validacion.datos;

    // ── Estado anterior: sirve de 404 y de dueño de la obra ─────────
    const [anterior] = await cargarComprasConDesvio(supabase, { id: params.id });

    if (!anterior) {
      return NextResponse.json({ error: "Compra no encontrada" }, { status: 404 });
    }

    const obraIdPedida = (body as { obra_id?: string }).obra_id;
    if (typeof obraIdPedida === "string" && obraIdPedida !== anterior.obra_id) {
      return NextResponse.json(
        { error: "No se puede mover una compra a otra obra" },
        { status: 400 },
      );
    }

    if (!(await existeInsumo(supabase, datos.insumo_id))) {
      return NextResponse.json(
        { error: `El insumo ${datos.insumo_id} no existe` },
        { status: 400 },
      );
    }

    const { error } = await supabase
      .from("compras")
      .update(datos)
      .eq("id", params.id);

    if (error) throw error;

    const [actualizada] = await cargarComprasConDesvio(supabase, {
      id: params.id,
    });

    return NextResponse.json(actualizada, { status: 200 });
  } catch (error) {
    const mensaje = loguearError("PUT /api/compras/[id]", error);
    return NextResponse.json({ error: mensaje }, { status: 500 });
  }
}

/**
 * DELETE /api/compras/[id]
 * Borra una compra. No arrastra nada: es una fila suelta del registro.
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const supabase = createSupabaseServerClient();

    const { data, error } = await supabase
      .from("compras")
      .delete()
      .eq("id", params.id)
      .select("id")
      .maybeSingle();

    const faltaTabla = mensajeSiFaltaTablaCompras(error);
    if (faltaTabla) throw new Error(faltaTabla);
    if (error) throw error;

    if (!data) {
      return NextResponse.json({ error: "Compra no encontrada" }, { status: 404 });
    }

    return NextResponse.json(
      { message: "Compra eliminada correctamente" },
      { status: 200 },
    );
  } catch (error) {
    const mensaje = loguearError("DELETE /api/compras/[id]", error);
    return NextResponse.json({ error: mensaje }, { status: 500 });
  }
}
