import { NextRequest, NextResponse } from "next/server";

import { calcularPrecioReceta } from "@/lib/calculos";
import { createSupabaseServerClient } from "@/lib/supabaseServer";
import type { Receta, RecetaConInsumos, RecetaInsumo } from "@/types";

const RECETA_SELECT = `
  id,
  nombre,
  unidad:unidad_medida,
  created_at,
  updated_at,
  ingredientes:receta_insumos (
    id,
    receta_id,
    insumo_id,
    cantidad,
    created_at,
    insumo:insumos (
      id,
      nombre,
      unidad:unidad_medida,
      tipo,
      precio:precio_unitario,
      created_at,
      updated_at
    )
  )
`;

function obtenerMensajeError(error: unknown): string {
  return error instanceof Error ? error.message : "Error inesperado";
}

function validarPayloadReceta(
  payload: Partial<Pick<Receta, "nombre" | "unidad">> & {
    ingredientes?: Array<Pick<RecetaInsumo, "insumo_id" | "cantidad">>;
  },
) {
  if (typeof payload.nombre !== "string" || payload.nombre.trim() === "") {
    return "El campo nombre es obligatorio.";
  }

  if (typeof payload.unidad !== "string" || payload.unidad.trim() === "") {
    return "El campo unidad es obligatorio.";
  }

  if (!Array.isArray(payload.ingredientes) || payload.ingredientes.length === 0) {
    return "La receta debe tener al menos un ingrediente.";
  }

  for (const ingrediente of payload.ingredientes) {
    if (
      typeof ingrediente.insumo_id !== "string" ||
      ingrediente.insumo_id.trim() === ""
    ) {
      return "Cada ingrediente debe tener un insumo_id valido.";
    }

    const cantidad =
      typeof ingrediente.cantidad === "number"
        ? ingrediente.cantidad
        : Number(ingrediente.cantidad);

    if (!Number.isFinite(cantidad) || cantidad <= 0) {
      return "Cada ingrediente debe tener una cantidad valida mayor a 0.";
    }
  }

  return null;
}

function mapearReceta(
  receta: Omit<RecetaConInsumos, "precio_unitario"> & {
    ingredientes?: RecetaConInsumos["ingredientes"];
  },
): RecetaConInsumos {
  const ingredientes = receta.ingredientes ?? [];

  return {
    ...receta,
    ingredientes,
    precio_unitario: calcularPrecioReceta(ingredientes),
  };
}

async function obtenerRecetaCompletaPorId(id: string) {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from("recetas")
    .select(RECETA_SELECT)
    .eq("id", id)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data ? mapearReceta(data as Omit<RecetaConInsumos, "precio_unitario">) : null;
}

export async function GET() {
  try {
    const supabase = createSupabaseServerClient();
    const { data, error } = await supabase
      .from("recetas")
      .select(RECETA_SELECT)
      .order("nombre", { ascending: true });

    if (error) {
      throw new Error(error.message);
    }

    const recetas = (data ?? []).map((receta) =>
      mapearReceta(receta as Omit<RecetaConInsumos, "precio_unitario">),
    );

    return NextResponse.json(recetas, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      { error: obtenerMensajeError(error) },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = createSupabaseServerClient();
    const body =
      (await request.json()) as Partial<Pick<Receta, "nombre" | "unidad">> & {
        ingredientes?: Array<Pick<RecetaInsumo, "insumo_id" | "cantidad">>;
      };

    const errorValidacion = validarPayloadReceta(body);

    if (errorValidacion) {
      return NextResponse.json({ error: errorValidacion }, { status: 400 });
    }

    const { data: recetaCreada, error: errorReceta } = await supabase
      .from("recetas")
      .insert({
        nombre: body.nombre!.trim(),
        unidad_medida: body.unidad!.trim(),
      })
      .select("id")
      .single();

    if (errorReceta) {
      throw new Error(errorReceta.message);
    }

    const ingredientes = body.ingredientes!.map((ingrediente) => ({
      receta_id: recetaCreada.id,
      insumo_id: ingrediente.insumo_id,
      cantidad:
        typeof ingrediente.cantidad === "number"
          ? ingrediente.cantidad
          : Number(ingrediente.cantidad),
    }));

    const { error: errorIngredientes } = await supabase
      .from("receta_insumos")
      .insert(ingredientes);

    if (errorIngredientes) {
      const { error: errorRollback } = await supabase
        .from("recetas")
        .delete()
        .eq("id", recetaCreada.id);

      if (errorRollback) {
        throw new Error(
          `${errorIngredientes.message}. No se pudo revertir la receta creada: ${errorRollback.message}`,
        );
      }

      throw new Error(errorIngredientes.message);
    }

    const recetaCompleta = await obtenerRecetaCompletaPorId(recetaCreada.id);

    if (!recetaCompleta) {
      return NextResponse.json(
        { error: "Receta no encontrada." },
        { status: 404 },
      );
    }

    return NextResponse.json(recetaCompleta, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: obtenerMensajeError(error) },
      { status: 500 },
    );
  }
}
