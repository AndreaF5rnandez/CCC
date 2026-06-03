import { NextRequest, NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabaseServer";
import type { Insumo } from "@/types";

const TIPOS_VALIDOS: Insumo["tipo"][] = [
  "material",
  "mano_de_obra",
  "equipo",
];

function esTipoValido(valor: unknown): valor is Insumo["tipo"] {
  return (
    typeof valor === "string" &&
    TIPOS_VALIDOS.includes(valor as Insumo["tipo"])
  );
}

function obtenerMensajeError(error: unknown): string {
  return error instanceof Error ? error.message : "Error inesperado";
}

function validarPayloadInsumo(
  payload: Partial<Pick<Insumo, "nombre" | "unidad" | "tipo" | "precio">>,
) {
  if (typeof payload.nombre !== "string" || payload.nombre.trim() === "") {
    return "El campo nombre es obligatorio.";
  }

  if (typeof payload.unidad !== "string" || payload.unidad.trim() === "") {
    return "El campo unidad es obligatorio.";
  }

  if (!esTipoValido(payload.tipo)) {
    return "El campo tipo debe ser material, mano_de_obra o equipo.";
  }

  const precio =
    typeof payload.precio === "number"
      ? payload.precio
      : Number(payload.precio);

  if (!Number.isFinite(precio) || precio < 0) {
    return "El campo precio debe ser un numero valido mayor o igual a 0.";
  }

  return null;
}

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const supabase = createSupabaseServerClient();
    const { data, error } = await supabase
      .from("insumos")
      .select("id, nombre, unidad:unidad_medida, tipo, precio:precio_unitario, created_at, updated_at")
      .eq("id", params.id)
      .maybeSingle();

    if (error) {
      throw new Error(error.message);
    }

    if (!data) {
      return NextResponse.json(
        { error: "Insumo no encontrado." },
        { status: 404 },
      );
    }

    return NextResponse.json(data as Insumo, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      { error: obtenerMensajeError(error) },
      { status: 500 },
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const supabase = createSupabaseServerClient();
    const body =
      (await request.json()) as Partial<
        Pick<Insumo, "nombre" | "unidad" | "tipo" | "precio">
      >;

    const errorValidacion = validarPayloadInsumo(body);

    if (errorValidacion) {
      return NextResponse.json({ error: errorValidacion }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("insumos")
      .update({
        nombre: body.nombre!.trim(),
        unidad_medida: body.unidad!.trim(),
        tipo: body.tipo!,
        precio_unitario:
          typeof body.precio === "number" ? body.precio : Number(body.precio),
      })
      .eq("id", params.id)
      .select("id, nombre, unidad:unidad_medida, tipo, precio:precio_unitario, created_at, updated_at")
      .maybeSingle();

    if (error) {
      throw new Error(error.message);
    }

    if (!data) {
      return NextResponse.json(
        { error: "Insumo no encontrado." },
        { status: 404 },
      );
    }

    return NextResponse.json(data as Insumo, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      { error: obtenerMensajeError(error) },
      { status: 500 },
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const supabase = createSupabaseServerClient();

    const { data: usos, error: errorUsos } = await supabase
      .from("receta_insumos")
      .select("receta_id")
      .eq("insumo_id", params.id);

    if (errorUsos) {
      throw new Error(errorUsos.message);
    }

    const cantidadUsos = usos?.length ?? 0;

    if (cantidadUsos > 0) {
      const recetasTexto = cantidadUsos === 1 ? "receta" : "recetas";

      return NextResponse.json(
        {
          error: `El insumo esta en uso y aparece en ${cantidadUsos} ${recetasTexto}.`,
        },
        { status: 400 },
      );
    }

    const { data, error } = await supabase
      .from("insumos")
      .delete()
      .eq("id", params.id)
      .select("id")
      .maybeSingle();

    if (error) {
      throw new Error(error.message);
    }

    if (!data) {
      return NextResponse.json(
        { error: "Insumo no encontrado." },
        { status: 404 },
      );
    }

    return NextResponse.json(
      { message: "Insumo eliminado correctamente." },
      { status: 200 },
    );
  } catch (error) {
    return NextResponse.json(
      { error: obtenerMensajeError(error) },
      { status: 500 },
    );
  }
}
