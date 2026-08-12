import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { calcularCantidadTotalItem } from "@/lib/calculos";
import { loguearError } from "@/lib/apiError";
import type {
  CertificacionItemsResponse,
  CertificacionMedicion,
  CertificacionRubroDisponible,
} from "@/types";

// Shape crudo de la lectura anidada.
type ItemRaw = {
  id: string;
  descripcion: string;
  unidad_medida: string;
  orden: number;
  mediciones: CertificacionMedicion[];
};
type RubroRaw = {
  id: string;
  nombre: string;
  orden: number;
  items: ItemRaw[];
};

/**
 * GET /api/certificacion-items?obra_id=uuid
 *
 * Árbol rubro → ítem → mediciones de una obra, para el selector de la vista
 * de Registrar.
 *
 * En obra no se ejecuta el ítem completo de una: se hacen mediciones puntuales
 * ("Pared 1", "Pared 5") en distintos momentos. Por eso el selector baja hasta
 * la medición, y hace falta su descripción y sus dimensiones para que el
 * encargado la reconozca — cosas que el endpoint de planificación no devuelve
 * porque ahí solo importa la cantidad total.
 *
 * Va todo en una consulta: el selector no puede pedir las mediciones ítem por
 * ítem.
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = createSupabaseServerClient();
    const { searchParams } = new URL(request.url);
    const obra_id = searchParams.get("obra_id");

    if (!obra_id) {
      return NextResponse.json(
        { error: "El parámetro obra_id es obligatorio" },
        { status: 400 },
      );
    }

    const { data: obra, error: obraError } = await supabase
      .from("obras")
      .select("id, nombre")
      .eq("id", obra_id)
      .single();

    if (obraError || !obra) {
      return NextResponse.json({ error: "Obra no encontrada" }, { status: 404 });
    }

    const { data, error } = await supabase
      .from("rubros")
      .select(`
        id,
        nombre,
        orden,
        items (
          id,
          descripcion,
          unidad_medida,
          orden,
          mediciones (
            id,
            descripcion,
            n,
            largo,
            ancho,
            alto,
            cantidad_calculada
          )
        )
      `)
      .eq("obra_id", obra_id)
      .order("orden", { ascending: true });

    if (error) throw error;

    const rubros: CertificacionRubroDisponible[] = (
      (data ?? []) as unknown as RubroRaw[]
    ).map((rubro) => ({
      rubro_id: rubro.id,
      rubro_nombre: rubro.nombre,
      items: rubro.items
        // PostgREST no ordena los anidados con el .order() de arriba.
        .slice()
        .sort((a, b) => a.orden - b.orden)
        .map((item) => ({
          item_id: item.id,
          descripcion: item.descripcion,
          unidad_medida: item.unidad_medida,
          // Mismo helper que el cómputo y el presupuesto.
          cantidad_total: calcularCantidadTotalItem(item.mediciones),
          mediciones: item.mediciones.map((m) => ({
            id: m.id,
            descripcion: m.descripcion,
            n: Number(m.n),
            largo: m.largo === null || m.largo === undefined ? undefined : Number(m.largo),
            ancho: m.ancho === null || m.ancho === undefined ? undefined : Number(m.ancho),
            alto: m.alto === null || m.alto === undefined ? undefined : Number(m.alto),
            cantidad_calculada: Number(m.cantidad_calculada),
          })),
        })),
    }));

    const response: CertificacionItemsResponse = {
      obra_id,
      obra_nombre: obra.nombre,
      rubros,
    };

    return NextResponse.json(response, { status: 200 });
  } catch (error) {
    const mensaje = loguearError("GET /api/certificacion-items", error);
    return NextResponse.json({ error: mensaje }, { status: 500 });
  }
}
