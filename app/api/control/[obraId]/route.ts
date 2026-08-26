import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { cargarItemsDeObra, calcularControl } from "@/lib/control";
import { cargarCertificacionesConDesvio } from "@/lib/certificacion";
import {
  cargarComprasConDesvio,
  consolidarComprasPorInsumo,
} from "@/lib/registroCompras";
import { hoyISO } from "@/lib/formato";
import { loguearError } from "@/lib/apiError";
import type { ControlObraResponse } from "@/types";

/**
 * GET /api/control/[obraId]
 *
 * Control de obra: los tres desvíos expresados en plata, y el avance real
 * contra la planificación mensual.
 *
 * Es la única lectura que cruza los tres módulos:
 *
 *  - de PLANIFICACIÓN salen los precios de cada ítem y el % de avance
 *    planificado para cada mes;
 *  - de CERTIFICACIÓN, lo ejecutado, el desvío de cómputo y el de material;
 *  - de COMPRAS, el precio realmente pagado por cada insumo.
 *
 * El cruce se hace en el backend, en una sola pasada, para que la cascada y las
 * tablas de la pantalla no puedan mostrar números que no cierran entre sí.
 *
 * Acepta un período opcional en meses de obra (`?desde=1&hasta=3`): sin él, el
 * corte es hasta hoy.
 *
 * Como todo desvío del sistema, no se guarda nada: se recalcula en cada lectura.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { obraId: string } },
) {
  try {
    const supabase = createSupabaseServerClient();

    /* Período opcional, en meses de obra: ?desde=1&hasta=3. Sin parámetros el
     * corte es "hasta hoy". El recorte se hace en el cálculo, no sobre totales
     * ya sumados, así que un mes suelto se contesta con la misma cuenta que la
     * obra entera. */
    const { searchParams } = new URL(request.url);
    const aMes = (valor: string | null): number | null => {
      if (valor === null || valor.trim() === "") return null;
      const n = Number(valor);
      return Number.isFinite(n) && n >= 1 ? Math.trunc(n) : null;
    };

    const { data: obra, error: obraError } = await supabase
      .from("obras")
      .select("id, nombre, fecha_inicio, plazo_meses")
      .eq("id", params.obraId)
      .single();

    if (obraError || !obra) {
      return NextResponse.json({ error: "Obra no encontrada" }, { status: 404 });
    }

    const [{ items, totalPresupuesto }, certificaciones, compras] = await Promise.all([
      cargarItemsDeObra(supabase, params.obraId),
      cargarCertificacionesConDesvio(supabase, { obraId: params.obraId }),
      cargarComprasConDesvio(supabase, { obraId: params.obraId }),
    ]);

    const respuesta: ControlObraResponse = calcularControl(
      {
        id: obra.id,
        nombre: obra.nombre,
        fecha_inicio: obra.fecha_inicio ?? null,
        plazo_meses: obra.plazo_meses ?? null,
      },
      items,
      totalPresupuesto,
      certificaciones,
      compras,
      // El mismo consolidado que muestra la sub-solapa de Compras: promedio
      // ponderado por cantidad, no promedio simple.
      consolidarComprasPorInsumo(compras),
      hoyISO(),
      { desde: aMes(searchParams.get("desde")), hasta: aMes(searchParams.get("hasta")) },
    );

    return NextResponse.json(respuesta, { status: 200 });
  } catch (error) {
    const mensaje = loguearError("GET /api/control/[obraId]", error);
    return NextResponse.json({ error: mensaje }, { status: 500 });
  }
}
