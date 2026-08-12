import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabaseServer";
import {
  calcularCantidadTotalItem,
  calcularConsumoIngredientes,
  metadatosInsumo,
} from "@/lib/calculos";
import { loguearError } from "@/lib/apiError";
import type {
  Item,
  RecetaConInsumos,
  CertificacionItemEjecutado,
  CertificacionItemPrevisto,
  CertificacionInsumoPrevisto,
  CertificacionPrevistoResponse,
} from "@/types";

// Shape de la respuesta anidada de Supabase para esta consulta.
type MedicionResumen = { cantidad_calculada: number };
type ItemPrevisto = Pick<Item, "id" | "descripcion" | "unidad_medida"> & {
  rubro: { obra_id: string } | null;
  receta: RecetaConInsumos | null;
  mediciones: MedicionResumen[];
};

/**
 * POST /api/certificacion-previsto
 *
 * Material PREVISTO para un conjunto de ítems ejecutados: la mitad "prevista"
 * de la comparación del módulo de Certificación (la otra mitad es el consumo
 * real que carga el encargado).
 *
 * OJO, no confundir con /api/explosion-insumos: ese reparte el consumo por mes
 * según los porcentajes de la tabla `planificacion`. Acá la planificación NO
 * interviene. El previsto sale de la cantidad de ítem efectivamente ejecutada:
 *
 *   cantidad_prevista(insumo) = Σ sobre los ítems de
 *                               cantidad_ejecutada_del_item × cantidad_en_receta
 *
 * Body: { obra_id, items: [{ item_id, cantidad_ejecutada? }] }
 * Un ítem sin `cantidad_ejecutada` se toma completo: su cantidad total es la
 * suma de mediciones, con el mismo helper que usan el cómputo, el presupuesto
 * y la explosión.
 *
 * Es POST y no GET porque la lista de ítems es la entrada del cálculo y no
 * entra cómoda en la query string; no escribe nada en la base.
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = createSupabaseServerClient();
    const body: unknown = await request.json();
    const { obra_id, items } = body as {
      obra_id?: string;
      items?: CertificacionItemEjecutado[];
    };

    // ── Validaciones ────────────────────────────────────────────────
    if (!obra_id || obra_id.trim() === "") {
      return NextResponse.json(
        { error: "El obra_id es obligatorio" },
        { status: 400 },
      );
    }

    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json(
        { error: "Hay que enviar al menos un ítem ejecutado" },
        { status: 400 },
      );
    }

    // Cantidad pedida por ítem: undefined = "el ítem completo".
    const cantidadPedida = new Map<string, number | undefined>();

    for (const entrada of items) {
      const itemId = entrada?.item_id;
      if (typeof itemId !== "string" || itemId.trim() === "") {
        return NextResponse.json(
          { error: "Cada ítem tiene que traer un item_id" },
          { status: 400 },
        );
      }

      // El mismo ítem dos veces sería ambiguo (¿se suman las cantidades o
      // gana la última?), y en la base un ítem tampoco puede repetirse dentro
      // de una certificación. Se rechaza en vez de adivinar.
      if (cantidadPedida.has(itemId)) {
        return NextResponse.json(
          { error: `El ítem ${itemId} viene repetido en la lista` },
          { status: 400 },
        );
      }

      const cruda = entrada.cantidad_ejecutada;
      if (cruda === undefined || cruda === null) {
        cantidadPedida.set(itemId, undefined);
        continue;
      }

      const cantidad = Number(cruda);
      if (!Number.isFinite(cantidad) || cantidad < 0) {
        return NextResponse.json(
          {
            error:
              "La cantidad ejecutada tiene que ser un número mayor o igual a 0",
          },
          { status: 400 },
        );
      }
      cantidadPedida.set(itemId, cantidad);
    }

    const idsPedidos = Array.from(cantidadPedida.keys());

    // ── La obra tiene que existir (y ser del usuario: lo filtra el RLS) ──
    const { data: obra, error: obraError } = await supabase
      .from("obras")
      .select("id")
      .eq("id", obra_id)
      .single();

    if (obraError || !obra) {
      return NextResponse.json({ error: "Obra no encontrada" }, { status: 404 });
    }

    // ── Ítems con su receta y sus mediciones ────────────────────────
    // El !inner sobre rubros más el filtro por obra_id dejan afuera los ítems
    // de otra obra: no se puede pedir el previsto de una obra usando ítems
    // ajenos. Los que queden afuera se reportan abajo como no encontrados.
    const { data: itemsData, error: itemsError } = await supabase
      .from("items")
      .select(`
        id,
        descripcion,
        unidad_medida,
        rubro:rubros!inner (
          obra_id
        ),
        receta:recetas (
          *,
          ingredientes:receta_insumos (
            *,
            insumo:insumos (*)
          )
        ),
        mediciones (
          cantidad_calculada
        )
      `)
      .in("id", idsPedidos)
      .eq("rubro.obra_id", obra_id);

    if (itemsError) throw itemsError;

    const itemsEncontrados = (itemsData ?? []) as unknown as ItemPrevisto[];

    // Un item_id que no aparece es un error del que llama (ítem inexistente o
    // de otra obra), no un ítem que "no aporta nada": se avisa, no se ignora.
    if (itemsEncontrados.length !== idsPedidos.length) {
      const encontrados = new Set(itemsEncontrados.map((i) => i.id));
      const faltantes = idsPedidos.filter((id) => !encontrados.has(id));
      return NextResponse.json(
        {
          error:
            "Estos ítems no existen o no pertenecen a la obra: " +
            faltantes.join(", "),
        },
        { status: 400 },
      );
    }

    // ── Cálculo ─────────────────────────────────────────────────────
    const porInsumo = new Map<string, CertificacionInsumoPrevisto>();
    const detalleItems: CertificacionItemPrevisto[] = [];

    for (const item of itemsEncontrados) {
      const cantidadTotal = calcularCantidadTotalItem(item.mediciones);
      const pedida = cantidadPedida.get(item.id);

      // Sin cantidad informada se ejecuta el ítem completo.
      const cantidadEjecutada = pedida === undefined ? cantidadTotal : pedida;

      const ingredientes = item.receta?.ingredientes ?? [];
      // Ítem sin receta o con receta vacía: no aporta insumos, pero se
      // devuelve igual en el detalle para que la vista lo pueda mostrar.
      const aportaInsumos = ingredientes.length > 0;

      detalleItems.push({
        item_id: item.id,
        descripcion: item.descripcion,
        unidad_medida: item.unidad_medida,
        cantidad_total: cantidadTotal,
        cantidad_ejecutada: cantidadEjecutada,
        origen_cantidad: pedida === undefined ? "total" : "informada",
        aporta_insumos: aportaInsumos,
      });

      if (!aportaInsumos) continue;

      for (const { insumo, cantidad } of calcularConsumoIngredientes(
        ingredientes,
        cantidadEjecutada,
      )) {
        // Un insumo usado por varios ítems se suma, no se repite.
        const acum = porInsumo.get(insumo.id);
        if (acum) {
          acum.cantidad_prevista += cantidad;
        } else {
          porInsumo.set(insumo.id, {
            ...metadatosInsumo(insumo),
            cantidad_prevista: cantidad,
          });
        }
      }
    }

    // Mismo orden estable que la explosión: por tipo y, dentro del tipo, por nombre.
    const insumos = Array.from(porInsumo.values()).sort((x, y) =>
      x.tipo === y.tipo
        ? x.nombre.localeCompare(y.nombre, "es")
        : x.tipo.localeCompare(y.tipo),
    );

    // Se devuelven los tres tipos etiquetados. Esta primera fase de
    // certificación es solo de materiales, pero el filtro lo hace la vista:
    // descartar acá obligaría a tocar el backend para sumar mano de obra.
    const response: CertificacionPrevistoResponse = {
      obra_id,
      items: detalleItems,
      insumos,
    };

    return NextResponse.json(response, { status: 200 });
  } catch (error) {
    const mensaje = loguearError("POST /api/certificacion-previsto", error);
    return NextResponse.json({ error: mensaje }, { status: 500 });
  }
}
