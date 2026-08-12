import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabaseServer";
import {
  cargarItemsParaPrevisto,
  calcularPrevistoConItems,
} from "@/lib/certificacion";
import { loguearError } from "@/lib/apiError";
import type {
  CertificacionItemEjecutado,
  CertificacionPrevistoResponse,
} from "@/types";

/**
 * POST /api/certificacion-previsto
 *
 * Material PREVISTO para un conjunto de ítems ejecutados: la mitad "prevista"
 * de la comparación del módulo de Certificación (la otra mitad es el consumo
 * real que carga el encargado). Sirve para previsualizar el previsto ANTES de
 * guardar la certificación; una vez guardada, el desvío viene calculado en
 * GET /api/certificaciones.
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

    const pedidos: CertificacionItemEjecutado[] = [];
    const vistos = new Set<string>();

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
      if (vistos.has(itemId)) {
        return NextResponse.json(
          { error: `El ítem ${itemId} viene repetido en la lista` },
          { status: 400 },
        );
      }
      vistos.add(itemId);

      const cruda = entrada.cantidad_ejecutada;
      if (cruda === undefined || cruda === null) {
        pedidos.push({ item_id: itemId });
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
      pedidos.push({ item_id: itemId, cantidad_ejecutada: cantidad });
    }

    // ── La obra tiene que existir (y ser del usuario: lo filtra el RLS) ──
    const { data: obra, error: obraError } = await supabase
      .from("obras")
      .select("id")
      .eq("id", obra_id)
      .single();

    if (obraError || !obra) {
      return NextResponse.json({ error: "Obra no encontrada" }, { status: 404 });
    }

    // ── Cálculo ─────────────────────────────────────────────────────
    const itemsPorId = await cargarItemsParaPrevisto(
      supabase,
      obra_id,
      pedidos.map((p) => p.item_id),
    );

    const previsto = calcularPrevistoConItems(pedidos, itemsPorId);

    // Un item_id que no aparece es un error del que llama (ítem inexistente o
    // de otra obra), no un ítem que "no aporta nada": se avisa, no se ignora.
    if (previsto.faltantes.length > 0) {
      return NextResponse.json(
        {
          error:
            "Estos ítems no existen o no pertenecen a la obra: " +
            previsto.faltantes.join(", "),
        },
        { status: 400 },
      );
    }

    const response: CertificacionPrevistoResponse = {
      obra_id,
      items: previsto.items,
      insumos: previsto.insumos,
    };

    return NextResponse.json(response, { status: 200 });
  } catch (error) {
    const mensaje = loguearError("POST /api/certificacion-previsto", error);
    return NextResponse.json({ error: mensaje }, { status: 500 });
  }
}
