import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabaseServer";
import {
  cargarCertificacionesConDesvio,
  cargarItemsParaPrevisto,
  calcularPrevistoConItems,
  detectarInsumosInexistentes,
  insertarHijosCertificacion,
  validarPayloadCertificacion,
} from "@/lib/certificacion";
import { loguearError } from "@/lib/apiError";
import type { CertificacionConDesvio } from "@/types";

/**
 * GET /api/certificaciones?obra_id=uuid
 *
 * Certificaciones de una obra, en orden cronológico, cada una con su detalle
 * y su DESVÍO ya calculado (previsto según recetas vs. real cargado).
 *
 * El desvío no se guarda en la base: se recalcula en cada lectura, así que
 * cambiar una receta o una medición se refleja solo.
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

    const certificaciones: CertificacionConDesvio[] =
      await cargarCertificacionesConDesvio(supabase, { obraId: obra_id });

    return NextResponse.json(certificaciones, { status: 200 });
  } catch (error) {
    const mensaje = loguearError("GET /api/certificaciones", error);
    return NextResponse.json({ error: mensaje }, { status: 500 });
  }
}

/**
 * POST /api/certificaciones
 *
 * Registra una ejecución real de obra.
 *
 * Body: {
 *   obra_id, fecha, descripcion?,
 *   items:   [item_id | { item_id, cantidad_ejecutada? }],
 *   insumos: [{ insumo_id, cantidad_real }]
 * }
 *
 * Escribe en las tres tablas. Supabase no expone transacciones desde el
 * cliente JS, así que si falla alguno de los hijos se borra la certificación
 * recién creada (el CASCADE se lleva lo que haya entrado) y no queda una
 * cabecera huérfana. No es un rollback real: si además fallara ese borrado,
 * se avisa en el mensaje de error.
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = createSupabaseServerClient();
    const body: unknown = await request.json();

    const validacion = validarPayloadCertificacion(body, true);
    if (!validacion.ok) {
      return NextResponse.json({ error: validacion.error }, { status: 400 });
    }

    const { obra_id } = body as { obra_id: string };
    const { fecha, descripcion, items, insumos } = validacion.datos;

    // ── La obra tiene que existir (y ser del usuario: lo filtra el RLS) ──
    const { data: obra, error: obraError } = await supabase
      .from("obras")
      .select("id")
      .eq("id", obra_id)
      .single();

    if (obraError || !obra) {
      return NextResponse.json({ error: "Obra no encontrada" }, { status: 404 });
    }

    // ── Los ítems tienen que ser de ESTA obra ───────────────────────
    // El RLS separa usuarios, pero no impide mezclar dos obras propias.
    const itemsPorId = await cargarItemsParaPrevisto(
      supabase,
      obra_id,
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

    // ── Los insumos tienen que existir ──────────────────────────────
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
    const { data: certificacion, error: errorCabecera } = await supabase
      .from("certificaciones")
      .insert({ obra_id, fecha, descripcion })
      .select("id")
      .single();

    if (errorCabecera) throw errorCabecera;
    if (!certificacion) {
      return NextResponse.json(
        { error: "No se pudo crear la certificación" },
        { status: 500 },
      );
    }

    // ── Hijos ───────────────────────────────────────────────────────
    const errorHijos = await insertarHijosCertificacion(
      supabase,
      certificacion.id,
      items,
      insumos,
    );

    if (errorHijos) {
      const { error: errorLimpieza } = await supabase
        .from("certificaciones")
        .delete()
        .eq("id", certificacion.id);

      if (errorLimpieza) {
        throw new Error(
          `${errorHijos}. Además no se pudo borrar la certificación a medio crear ` +
            `(id ${certificacion.id}): ${errorLimpieza.message}`,
        );
      }
      throw new Error(errorHijos);
    }

    const [creada] = await cargarCertificacionesConDesvio(supabase, {
      id: certificacion.id,
    });

    return NextResponse.json(creada, { status: 201 });
  } catch (error) {
    const mensaje = loguearError("POST /api/certificaciones", error);
    return NextResponse.json({ error: mensaje }, { status: 500 });
  }
}

