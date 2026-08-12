import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabaseServer";
import {
  calcularCantidadTotalItem,
  calcularConsumoIngredientes,
  metadatosInsumo,
  resolverCompra,
} from "@/lib/calculos";
import { cargarOverridesCompra } from "@/lib/compra";
import { loguearError } from "@/lib/apiError";
import type {
  Rubro,
  Item,
  Insumo,
  InsumoConsumoBase,
  RecetaConInsumos,
  Planificacion,
  ExplosionInsumo,
  ExplosionInsumosResponse,
} from "@/types";

// Tipos locales para la respuesta anidada de Supabase (mismo shape que tarea 2).
type MedicionResumen = { id: string; item_id: string; cantidad_calculada: number };
type PlanificacionResumen = Pick<Planificacion, "mes" | "pct_plan">;
type ItemExplosion = Item & {
  receta?: RecetaConInsumos | null;
  mediciones: MedicionResumen[];
  planificacion: PlanificacionResumen[];
};
type RubroExplosion = Rubro & { items: ItemExplosion[] };

// Acumulador interno por insumo: metadatos + vector de consumo por mes.
type AcumInsumo = InsumoConsumoBase & {
  // Referencia de compra del insumo; el override de la obra se aplica al final.
  unidad_compra: string | null;
  factor_compra: number | null;
  consumo_por_mes: number[]; // índice 0 = mes 1
};

/**
 * GET /api/explosion-insumos/[obraId]
 *
 * Explosión de insumos: cruza los ítems de la obra con sus recetas y con los
 * porcentajes de avance del cronograma (tabla planificacion) para calcular
 * cuánto de cada insumo se consume por mes.
 *
 * Cálculo, por ítem y por mes con porcentaje cargado:
 *   cantidad_fisica_item_mes = (pct_plan / 100) × cantidad_total_del_item
 *   cantidad_insumo          = cantidad_fisica_item_mes × cantidad_en_receta
 * Se agrupa por insumo y mes (un insumo consumido por varios ítems se suma).
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: { obraId: string } },
) {
  try {
    const supabase = createSupabaseServerClient();

    // Verificar que la obra existe y traer los campos de calendario.
    const { data: obra, error: obraError } = await supabase
      .from("obras")
      .select("id, nombre, plazo_meses, fecha_inicio")
      .eq("id", params.obraId)
      .single();

    if (obraError || !obra) {
      return NextResponse.json({ error: "Obra no encontrada" }, { status: 404 });
    }

    // Rubros → items → receta (con ingredientes e insumo) → mediciones → planificacion.
    // Mismo select que el endpoint de lectura de planificación (tarea 2).
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

    const rubros = (rubrosData ?? []) as RubroExplosion[];

    // Overrides de compra de ESTA obra. Pisan la referencia del insumo sin
    // afectar a las demás obras; se resuelven al armar la respuesta. Es el
    // mismo loader que usa la certificación, para que el factor coincida.
    const overridePorInsumo = await cargarOverridesCompra(
      supabase,
      params.obraId,
      "GET /api/explosion-insumos/[obraId]",
    );

    // Meses de la grilla: 1..plazo_meses. Los porcentajes cargados en meses
    // fuera de ese rango (huérfanos por un recorte de plazo) NO se cuentan,
    // igual que el cronograma, que solo itera hasta plazo_meses.
    const meses = obra.plazo_meses && obra.plazo_meses > 0 ? obra.plazo_meses : 0;

    const porInsumo = new Map<string, AcumInsumo>();

    const obtenerAcum = (insumo: Insumo): AcumInsumo => {
      let acum = porInsumo.get(insumo.id);
      if (!acum) {
        acum = {
          ...metadatosInsumo(insumo),
          unidad_compra: insumo.unidad_compra ?? null,
          factor_compra:
            insumo.factor_compra === null || insumo.factor_compra === undefined
              ? null
              : Number(insumo.factor_compra),
          consumo_por_mes: new Array<number>(meses).fill(0),
        };
        porInsumo.set(insumo.id, acum);
      }
      return acum;
    };

    for (const rubro of rubros) {
      for (const item of rubro.items) {
        // Ítem sin receta o con receta vacía no puede explotar insumos.
        if (!item.receta) continue;
        const ingredientes = item.receta.ingredientes ?? [];
        if (ingredientes.length === 0) continue;

        // Cantidad total del ítem (helper compartido con tarea 2).
        const cantidadTotal = calcularCantidadTotalItem(item.mediciones);

        // Registramos cada insumo de la receta aunque el ítem no tenga avance:
        // así aparece en la lista con su fila de ceros y la vista puede dibujar
        // la grilla completa (no se omite silenciosamente).
        for (const ing of ingredientes) {
          obtenerAcum(ing.insumo);
        }

        // Acumular el consumo mes a mes según los porcentajes del cronograma.
        for (const p of item.planificacion) {
          const mes = Number(p.mes);
          if (mes < 1 || mes > meses) continue; // fuera de la grilla → no aporta
          const pct = Number(p.pct_plan);
          if (!pct) continue; // 0 o inválido → no aporta

          const cantidadFisica = (pct / 100) * cantidadTotal;
          for (const { insumo, cantidad } of calcularConsumoIngredientes(
            ingredientes,
            cantidadFisica,
          )) {
            obtenerAcum(insumo).consumo_por_mes[mes - 1] += cantidad;
          }
        }
      }
    }

    const insumos: ExplosionInsumo[] = Array.from(porInsumo.values())
      .map((a) => ({
        insumo_id: a.insumo_id,
        nombre: a.nombre,
        unidad_medida: a.unidad_medida,
        tipo: a.tipo,
        precio_unitario: a.precio_unitario,
        consumo_por_mes: a.consumo_por_mes,
        total: a.consumo_por_mes.reduce((s, v) => s + v, 0),
        // Conversión a unidad de compra ya resuelta (override de la obra sobre
        // referencia del insumo). La vista solo la muestra.
        ...resolverCompra(
          { unidad_compra: a.unidad_compra, factor_compra: a.factor_compra },
          overridePorInsumo.get(a.insumo_id) ?? null,
        ),
      }))
      // Orden estable para la vista: por tipo y, dentro del tipo, por nombre.
      .sort((x, y) =>
        x.tipo === y.tipo
          ? x.nombre.localeCompare(y.nombre, "es")
          : x.tipo.localeCompare(y.tipo),
      );

    const response: ExplosionInsumosResponse = {
      obra_id: params.obraId,
      obra_nombre: obra.nombre,
      plazo_meses: obra.plazo_meses,
      fecha_inicio: obra.fecha_inicio,
      insumos,
    };

    return NextResponse.json(response, { status: 200 });
  } catch (error) {
    const mensaje = loguearError("GET /api/explosion-insumos/[obraId]", error);
    return NextResponse.json({ error: mensaje }, { status: 500 });
  }
}
