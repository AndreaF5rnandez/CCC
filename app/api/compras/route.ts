import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabaseServer";
import {
  cargarComprasConDesvio,
  consolidarComprasPorInsumo,
  existeInsumo,
  mensajeSiFaltaTablaCompras,
  validarPayloadCompra,
} from "@/lib/registroCompras";
import { loguearError } from "@/lib/apiError";
import type { ComprasResponse } from "@/types";

/**
 * GET /api/compras?obra_id=uuid
 *
 * Registro de compras de una obra, en orden cronológico, y el desvío de PRECIO
 * en dos niveles:
 *
 *  - `compras`: cada compra con lo pagado por unidad de compra, el precio
 *    presupuestado convertido a esa misma unidad, y la diferencia entre ambos.
 *  - `consolidado`: un renglón por insumo con el precio real promedio ponderado
 *    por cantidad, el previsto, el desvío y el gasto total de la obra.
 *
 * Los dos viajan en la misma respuesta porque salen de los mismos datos y del
 * mismo factor de compra: calcularlos juntos evita que las dos tablas de la
 * pantalla puedan mostrar números distintos, y ahorra una segunda vuelta a la
 * base para releer lo mismo.
 *
 * Nada de esto se guarda: el desvío se recalcula en cada lectura, así que
 * corregir el precio de un insumo se refleja solo.
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

    const compras = await cargarComprasConDesvio(supabase, { obraId: obra_id });

    const respuesta: ComprasResponse = {
      obra_id,
      compras,
      consolidado: consolidarComprasPorInsumo(compras),
    };

    return NextResponse.json(respuesta, { status: 200 });
  } catch (error) {
    const mensaje = loguearError("GET /api/compras", error);
    return NextResponse.json({ error: mensaje }, { status: 500 });
  }
}

/**
 * POST /api/compras
 *
 * Registra una compra.
 *
 * Body: { obra_id, insumo_id, fecha, cantidad, precio_unitario_compra, proveedor? }
 *
 * `cantidad` y `precio_unitario_compra` van en unidad de COMPRA (50 bolsas a
 * $153,75 la bolsa). Se guardan tal cual: la conversión a unidad base para
 * comparar contra el presupuesto se hace al leer.
 *
 * Un mismo insumo puede tener varias compras en la obra —distintas fechas,
 * precios y proveedores—, así que no se busca ni se pisa una fila existente.
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = createSupabaseServerClient();
    const body: unknown = await request.json();

    const validacion = validarPayloadCompra(body, true);
    if (!validacion.ok) {
      return NextResponse.json({ error: validacion.error }, { status: 400 });
    }

    const { obra_id } = body as { obra_id: string };
    const datos = validacion.datos;

    // ── La obra tiene que existir (y ser del usuario: lo filtra el RLS) ──
    const { data: obra, error: obraError } = await supabase
      .from("obras")
      .select("id")
      .eq("id", obra_id)
      .maybeSingle();

    if (obraError) throw obraError;
    if (!obra) {
      return NextResponse.json({ error: "Obra no encontrada" }, { status: 404 });
    }

    // ── El insumo tiene que existir ─────────────────────────────────
    if (!(await existeInsumo(supabase, datos.insumo_id))) {
      return NextResponse.json(
        { error: `El insumo ${datos.insumo_id} no existe` },
        { status: 400 },
      );
    }

    const { data: creada, error } = await supabase
      .from("compras")
      .insert({ obra_id, ...datos })
      .select("id")
      .single();

    const faltaTabla = mensajeSiFaltaTablaCompras(error);
    if (faltaTabla) throw new Error(faltaTabla);
    if (error) throw error;

    // Se relee para devolverla con el insumo, la conversión y el desvío ya
    // resueltos: la vista la agrega a la tabla sin tener que calcular nada.
    const [compra] = await cargarComprasConDesvio(supabase, { id: creada.id });

    return NextResponse.json(compra, { status: 201 });
  } catch (error) {
    const mensaje = loguearError("POST /api/compras", error);
    return NextResponse.json({ error: mensaje }, { status: 500 });
  }
}
