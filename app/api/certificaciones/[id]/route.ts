import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabaseServer";
import {
  cargarCertificacionesConDesvio,
  cargarItemsParaPrevisto,
  calcularPrevistoConItems,
  detectarInsumosInexistentes,
  insertarHijosCertificacion,
  resolverMedidasReales,
  validarPayloadCertificacion,
} from "@/lib/certificacion";
import { loguearError } from "@/lib/apiError";
import type { CertificacionItemEjecutado } from "@/types";

/**
 * GET /api/certificaciones/[id]
 * Una certificación con su detalle y su desvío calculado al momento.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const supabase = createSupabaseServerClient();
    const [certificacion] = await cargarCertificacionesConDesvio(supabase, {
      id: params.id,
    });

    if (!certificacion) {
      return NextResponse.json(
        { error: "Certificación no encontrada" },
        { status: 404 },
      );
    }

    return NextResponse.json(certificacion, { status: 200 });
  } catch (error) {
    const mensaje = loguearError("GET /api/certificaciones/[id]", error);
    return NextResponse.json({ error: mensaje }, { status: 500 });
  }
}

/**
 * PUT /api/certificaciones/[id]
 *
 * Edita fecha, descripción, ítems ejecutados, material real y las medidas
 * reales de las mediciones ejecutadas.
 *
 * Los hijos se reemplazan enteros (borrar y recrear), igual que hace el PUT de
 * recetas con sus ingredientes: lo que no venga en las listas se borra. La
 * obra NO se puede cambiar — mover una certificación de obra invalidaría su
 * desvío entero, así que si viene otro obra_id se rechaza.
 *
 * Ante un fallo al recrear los hijos se restaura el estado anterior. No es una
 * transacción real (Supabase no las expone desde el cliente JS); si la
 * restauración también falla, el mensaje de error lo dice.
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const supabase = createSupabaseServerClient();
    const body: unknown = await request.json();

    const validacion = validarPayloadCertificacion(body, false);
    if (!validacion.ok) {
      return NextResponse.json({ error: validacion.error }, { status: 400 });
    }

    const { fecha, descripcion, items, insumos } = validacion.datos;

    // ── Estado anterior: sirve de 404, de dueño de la obra y de respaldo ──
    const [anterior] = await cargarCertificacionesConDesvio(supabase, {
      id: params.id,
    });

    if (!anterior) {
      return NextResponse.json(
        { error: "Certificación no encontrada" },
        { status: 404 },
      );
    }

    const obraIdPedida = (body as { obra_id?: string }).obra_id;
    if (typeof obraIdPedida === "string" && obraIdPedida !== anterior.obra_id) {
      return NextResponse.json(
        { error: "No se puede mover una certificación a otra obra" },
        { status: 400 },
      );
    }

    // ── Los ítems tienen que ser de la obra de esta certificación ───
    const itemsPorId = await cargarItemsParaPrevisto(
      supabase,
      anterior.obra_id,
      items.map((i) => i.item_id),
    );
    const { faltantes } = calcularPrevistoConItems(items, itemsPorId);

    if (faltantes.length > 0) {
      return NextResponse.json(
        {
          error:
            "Estos ítems no existen o no pertenecen a la obra: " +
            faltantes.join(", "),
        },
        { status: 400 },
      );
    }

    // ── Medidas reales: mediciones del ítem y realmente ejecutadas ──
    const medidasReales = resolverMedidasReales(items, itemsPorId);
    if (!medidasReales.ok) {
      return NextResponse.json({ error: medidasReales.error }, { status: 400 });
    }

    const insumosInexistentes = await detectarInsumosInexistentes(
      supabase,
      insumos.map((i) => i.insumo_id),
    );

    if (insumosInexistentes.length > 0) {
      return NextResponse.json(
        { error: "Estos insumos no existen: " + insumosInexistentes.join(", ") },
        { status: 400 },
      );
    }

    // ── Cabecera ────────────────────────────────────────────────────
    const { error: errorCabecera } = await supabase
      .from("certificaciones")
      .update({ fecha, descripcion })
      .eq("id", params.id);

    if (errorCabecera) throw errorCabecera;

    // ── Hijos: borrar y recrear ─────────────────────────────────────
    const { error: errorBorrarItems } = await supabase
      .from("certificacion_items")
      .delete()
      .eq("certificacion_id", params.id);

    if (errorBorrarItems) throw errorBorrarItems;

    const { error: errorBorrarInsumos } = await supabase
      .from("certificacion_insumos")
      .delete()
      .eq("certificacion_id", params.id);

    if (errorBorrarInsumos) throw errorBorrarInsumos;

    // Si la tabla todavía no existe (falta la migración 012), no hay nada que
    // borrar: se ignora ese error puntual y la edición sigue.
    const { error: errorBorrarMediciones } = await supabase
      .from("certificacion_mediciones")
      .delete()
      .eq("certificacion_id", params.id);

    if (errorBorrarMediciones && errorBorrarMediciones.code !== "42P01") {
      throw errorBorrarMediciones;
    }

    // Las medidas reales cuelgan de la certificación, no de
    // certificacion_mediciones: el CASCADE de arriba no se las lleva, hay que
    // borrarlas aparte. Si falta la migración 014, no hay nada que borrar.
    const { error: errorBorrarMedidasReales } = await supabase
      .from("mediciones_reales")
      .delete()
      .eq("certificacion_id", params.id);

    if (errorBorrarMedidasReales && errorBorrarMedidasReales.code !== "42P01") {
      throw errorBorrarMedidasReales;
    }

    const errorHijos = await insertarHijosCertificacion(
      supabase,
      params.id,
      items,
      insumos,
      medidasReales.filas,
    );

    if (errorHijos) {
      const errorRestauracion = await restaurarEstadoAnterior(
        supabase,
        params.id,
        anterior,
      );

      if (errorRestauracion) {
        throw new Error(
          `${errorHijos}. No se pudo revertir la edición: ${errorRestauracion}`,
        );
      }
      throw new Error(errorHijos);
    }

    const [actualizada] = await cargarCertificacionesConDesvio(supabase, {
      id: params.id,
    });

    return NextResponse.json(actualizada, { status: 200 });
  } catch (error) {
    const mensaje = loguearError("PUT /api/certificaciones/[id]", error);
    return NextResponse.json({ error: mensaje }, { status: 500 });
  }
}

/**
 * DELETE /api/certificaciones/[id]
 * El CASCADE de las FKs se lleva sus ítems y su material real.
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const supabase = createSupabaseServerClient();

    const { data, error } = await supabase
      .from("certificaciones")
      .delete()
      .eq("id", params.id)
      .select("id")
      .maybeSingle();

    if (error) throw error;

    if (!data) {
      return NextResponse.json(
        { error: "Certificación no encontrada" },
        { status: 404 },
      );
    }

    return NextResponse.json(
      { message: "Certificación eliminada correctamente" },
      { status: 200 },
    );
  } catch (error) {
    const mensaje = loguearError("DELETE /api/certificaciones/[id]", error);
    return NextResponse.json({ error: mensaje }, { status: 500 });
  }
}

/**
 * Vuelve a dejar la certificación como estaba antes de una edición fallida.
 *
 * Restaura las cuatro tablas hijas, incluidas las mediciones ejecutadas y sus
 * medidas reales: el estado anterior se reconstruye desde el desvío de cómputo
 * que ya trae la lectura, sin volver a consultar.
 *
 * @returns El mensaje de error si la restauración falló, o null si salió bien.
 */
async function restaurarEstadoAnterior(
  supabase: ReturnType<typeof createSupabaseServerClient>,
  certificacionId: string,
  anterior: Awaited<ReturnType<typeof cargarCertificacionesConDesvio>>[number],
): Promise<string | null> {
  const { error: errorCabecera } = await supabase
    .from("certificaciones")
    .update({ fecha: anterior.fecha, descripcion: anterior.descripcion })
    .eq("id", certificacionId);

  // Se borra todo lo que haya quedado del intento fallido antes de recrear:
  // si no, el UNIQUE de mediciones y medidas reales rechazaría la restauración.
  for (const tabla of [
    "certificacion_items",
    "certificacion_insumos",
    "certificacion_mediciones",
    "mediciones_reales",
  ]) {
    await supabase.from(tabla).delete().eq("certificacion_id", certificacionId);
  }

  // Qué mediciones tenía cada ítem y cuáles traían medida real.
  const medicionesPorItem = new Map<string, string[]>();
  const medidasReales: Array<{
    medicion_id: string;
    n: number | null;
    largo: number | null;
    ancho: number | null;
    alto: number | null;
  }> = [];

  for (const fila of anterior.desvio_computo.mediciones) {
    const ids = medicionesPorItem.get(fila.item_id) ?? [];
    ids.push(fila.medicion_id);
    medicionesPorItem.set(fila.item_id, ids);

    if (fila.real) {
      medidasReales.push({
        medicion_id: fila.medicion_id,
        n: fila.real.n,
        largo: fila.real.largo,
        ancho: fila.real.ancho,
        alto: fila.real.alto,
      });
    }
  }

  const items: CertificacionItemEjecutado[] = anterior.items.map((item) => ({
    item_id: item.item_id,
    // Se restaura la cantidad del CÓMPUTO, no la ajustada por medidas reales:
    // el ajuste no se persiste, se recalcula al leer. Guardar la ajustada lo
    // aplicaría dos veces. Y solo era parcial si el origen lo dice.
    cantidad_ejecutada:
      item.origen_cantidad === "informada" ? item.cantidad_planificada : null,
    medicion_ids: medicionesPorItem.get(item.item_id),
  }));

  const errorHijos = await insertarHijosCertificacion(
    supabase,
    certificacionId,
    items,
    anterior.insumos_reales.map((insumo) => ({
      insumo_id: insumo.insumo_id,
      cantidad_real: insumo.cantidad_real,
    })),
    medidasReales,
  );

  const detalles = [errorCabecera?.message, errorHijos].filter(Boolean);
  return detalles.length > 0 ? detalles.join(" ") : null;
}
