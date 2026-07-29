import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { calcularPrecioReceta, calcularCantidadTotalItem } from "@/lib/calculos";
import { loguearError } from "@/lib/apiError";
import type {
  Rubro,
  Item,
  RecetaConInsumos,
  Planificacion,
  PlanificacionResponse,
  PlanificacionRubro,
  PlanificacionItem,
} from "@/types";

// Tipos locales para la respuesta anidada de Supabase
type MedicionResumen = { id: string; item_id: string; cantidad_calculada: number };
type PlanificacionResumen = Pick<Planificacion, 'mes' | 'pct_plan'>;
type ItemPresupuesto = Item & {
  receta?: RecetaConInsumos | null;
  mediciones: MedicionResumen[];
  planificacion: PlanificacionResumen[];
};
type RubroPresupuesto = Rubro & { items: ItemPresupuesto[] };

export async function GET(
  _request: NextRequest,
  { params }: { params: { obraId: string } },
) {
  try {
    const supabase = createSupabaseServerClient();

    // Verificar que la obra existe
    const { data: obra, error: obraError } = await supabase
      .from("obras")
      .select("id, nombre, plazo_meses, fecha_inicio")
      .eq("id", params.obraId)
      .single();

    if (obraError || !obra) {
      return NextResponse.json({ error: "Obra no encontrada" }, { status: 404 });
    }

    // ── Obtener rubros con items, recetas y mediciones ──────────────────
    const { data: rubrosData, error: rubrosError } = await supabase
      .from("rubros")
      .select(`
        *,
        items (
          *,
          receta:recetas (
            *,
            ingredientes:receta_insumos (
              *,
              insumo:insumos (*)
            )
          ),
          mediciones (
            id,
            item_id,
            cantidad_calculada
          ),
          planificacion (
            mes,
            pct_plan
          )
        )
      `)
      .eq("obra_id", params.obraId)
      .order("orden", { ascending: true });

    if (rubrosError) throw rubrosError;

    const rubros = (rubrosData ?? []) as RubroPresupuesto[];

    // ── Calcular subtotales y incidencias ────────────────────────────────
    let totalCostoCosto = 0;
    const rubrosCalculados: PlanificacionRubro[] = [];

    for (const rubro of rubros) {
      const itemsOrdenados = [...rubro.items].sort((a, b) => a.orden - b.orden);
      const items: PlanificacionItem[] = [];

      for (const item of itemsOrdenados) {
        if (!item.receta) continue;

        const cantidad_total = calcularCantidadTotalItem(item.mediciones);
        const precio_unitario = calcularPrecioReceta(item.receta.ingredientes);
        const subtotal_costo_costo = cantidad_total * precio_unitario;
        totalCostoCosto += subtotal_costo_costo;

        items.push({
          item_id: item.id,
          descripcion: item.descripcion,
          unidad_medida: item.unidad_medida,
          cantidad_total,
          subtotal_costo_costo,
          // incidencia se calcula después de conocer el total
          incidencia_pct: 0,
          planificacion: (item.planificacion as PlanificacionResumen[]) || [],
        });
      }

      rubrosCalculados.push({
        rubro_id: rubro.id,
        rubro_nombre: rubro.nombre,
        items,
      });
    }

    // ── Calcular incidencias (ahora que conocemos el total) ──────────────
    for (const rubro of rubrosCalculados) {
      for (const item of rubro.items) {
        item.incidencia_pct =
          totalCostoCosto > 0 ? (item.subtotal_costo_costo / totalCostoCosto) * 100 : 0;
      }
    }

    const response: PlanificacionResponse = {
      obra_id: params.obraId,
      obra_nombre: obra.nombre,
      plazo_meses: obra.plazo_meses,
      fecha_inicio: obra.fecha_inicio,
      total_costo_costo: totalCostoCosto,
      rubros: rubrosCalculados,
    };

    return NextResponse.json(response, { status: 200 });
  } catch (error) {
    const mensaje = loguearError("GET /api/planificacion/[obraId]", error);
    return NextResponse.json({ error: mensaje }, { status: 500 });
  }
}
