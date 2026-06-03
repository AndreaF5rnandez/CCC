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

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const receta = await obtenerRecetaCompletaPorId(params.id);

    if (!receta) {
      return NextResponse.json(
        { error: "Receta no encontrada." },
        { status: 404 },
      );
    }

    return NextResponse.json(receta, { status: 200 });
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
      (await request.json()) as Partial<Pick<Receta, "nombre" | "unidad">> & {
        ingredientes?: Array<Pick<RecetaInsumo, "insumo_id" | "cantidad">>;
      };

    const errorValidacion = validarPayloadReceta(body);

    if (errorValidacion) {
      return NextResponse.json({ error: errorValidacion }, { status: 400 });
    }

    const recetaAnterior = await obtenerRecetaCompletaPorId(params.id);

    if (!recetaAnterior) {
      return NextResponse.json(
        { error: "Receta no encontrada." },
        { status: 404 },
      );
    }

    const { error: errorActualizarReceta } = await supabase
      .from("recetas")
      .update({
        nombre: body.nombre!.trim(),
        unidad_medida: body.unidad!.trim(),
      })
      .eq("id", params.id);

    if (errorActualizarReceta) {
      throw new Error(errorActualizarReceta.message);
    }

    const { error: errorEliminarIngredientes } = await supabase
      .from("receta_insumos")
      .delete()
      .eq("receta_id", params.id);

    if (errorEliminarIngredientes) {
      throw new Error(errorEliminarIngredientes.message);
    }

    const ingredientesNuevos = body.ingredientes!.map((ingrediente) => ({
      receta_id: params.id,
      insumo_id: ingrediente.insumo_id,
      cantidad:
        typeof ingrediente.cantidad === "number"
          ? ingrediente.cantidad
          : Number(ingrediente.cantidad),
    }));

    const { error: errorInsertarIngredientes } = await supabase
      .from("receta_insumos")
      .insert(ingredientesNuevos);

    if (errorInsertarIngredientes) {
      const { error: errorRestaurarReceta } = await supabase
        .from("recetas")
        .update({
          nombre: recetaAnterior.nombre,
          unidad_medida: recetaAnterior.unidad,
        })
        .eq("id", params.id);

      let errorRestaurarIngredientes: string | null = null;

      if (recetaAnterior.ingredientes.length > 0) {
        const { error } = await supabase.from("receta_insumos").insert(
          recetaAnterior.ingredientes.map((ingrediente) => ({
            receta_id: params.id,
            insumo_id: ingrediente.insumo_id,
            cantidad: ingrediente.cantidad,
          })),
        );

        errorRestaurarIngredientes = error?.message ?? null;
      }

      if (errorRestaurarReceta || errorRestaurarIngredientes) {
        const detallesRollback = [
          errorRestaurarReceta?.message,
          errorRestaurarIngredientes,
        ]
          .filter(Boolean)
          .join(" ");

        throw new Error(
          `${errorInsertarIngredientes.message}. No se pudo revertir completamente la actualizacion: ${detallesRollback}`,
        );
      }

      throw new Error(errorInsertarIngredientes.message);
    }

    const recetaActualizada = await obtenerRecetaCompletaPorId(params.id);

    if (!recetaActualizada) {
      return NextResponse.json(
        { error: "Receta no encontrada." },
        { status: 404 },
      );
    }

    return NextResponse.json(recetaActualizada, { status: 200 });
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
    const { count, error: errorMediciones } = await supabase
      .from("mediciones")
      .select("id", { count: "exact", head: true })
      .eq("receta_id", params.id);

    if (errorMediciones) {
      throw new Error(errorMediciones.message);
    }

    const cantidadMediciones = count ?? 0;

    if (cantidadMediciones > 0) {
      const medicionesTexto =
        cantidadMediciones === 1 ? "medicion" : "mediciones";

      return NextResponse.json(
        {
          error: `La receta esta en uso y aparece en ${cantidadMediciones} ${medicionesTexto}.`,
        },
        { status: 400 },
      );
    }

    const { data, error } = await supabase
      .from("recetas")
      .delete()
      .eq("id", params.id)
      .select("id")
      .maybeSingle();

    if (error) {
      throw new Error(error.message);
    }

    if (!data) {
      return NextResponse.json(
        { error: "Receta no encontrada." },
        { status: 404 },
      );
    }

    return NextResponse.json(
      { message: "Receta eliminada correctamente." },
      { status: 200 },
    );
  } catch (error) {
    return NextResponse.json(
      { error: obtenerMensajeError(error) },
      { status: 500 },
    );
  }
}
