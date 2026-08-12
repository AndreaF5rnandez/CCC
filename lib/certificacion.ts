// Solo se usa para tipar el cliente: import type para no arrastrar
// next/headers al runtime de quien importe las funciones puras de este módulo.
import type { createSupabaseServerClient } from "./supabaseServer";
import {
  calcularCantidadTotalItem,
  calcularConsumoIngredientes,
  metadatosInsumo,
} from "./calculos";
import type {
  Insumo,
  Item,
  RecetaConInsumos,
  Certificacion,
  CertificacionConDesvio,
  CertificacionItemEjecutado,
  CertificacionItemPrevisto,
  CertificacionInsumoPrevisto,
  CertificacionInsumoReal,
  CertificacionDesvioInsumo,
} from "../types";

type SupabaseServer = ReturnType<typeof createSupabaseServerClient>;

/** Un ítem con lo necesario para calcular su previsto: la receta y las
 *  mediciones de las que sale su cantidad total. */
export type ItemParaPrevisto = Pick<
  Item,
  "id" | "descripcion" | "unidad_medida"
> & {
  receta: RecetaConInsumos | null;
  mediciones: Array<{ cantidad_calculada: number }>;
};

// Shape crudo que devuelve PostgREST para el select de abajo.
type ItemPrevistoRaw = ItemParaPrevisto & { rubro: { obra_id: string } | null };

const ITEM_PREVISTO_SELECT = `
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
`;

/**
 * Trae los ítems de UNA obra necesarios para calcular previstos, indexados por id.
 *
 * El `!inner` sobre rubros más el filtro por obra_id dejan afuera los ítems de
 * otra obra: quien llame compara el tamaño del resultado contra lo que pidió
 * para detectar ítems ajenos o inexistentes. Es una sola consulta aunque se
 * pidan los ítems de varias certificaciones, para no caer en N+1 al listar.
 *
 * @param supabase Cliente de servidor (el RLS filtra por usuario).
 * @param obraId Obra a la que tienen que pertenecer los ítems.
 * @param itemIds Ids de ítem a traer; sin ids devuelve un mapa vacío.
 */
export async function cargarItemsParaPrevisto(
  supabase: SupabaseServer,
  obraId: string,
  itemIds: string[],
): Promise<Map<string, ItemParaPrevisto>> {
  if (itemIds.length === 0) return new Map();

  const { data, error } = await supabase
    .from("items")
    .select(ITEM_PREVISTO_SELECT)
    .in("id", itemIds)
    .eq("rubro.obra_id", obraId);

  if (error) throw error;

  const filas = (data ?? []) as unknown as ItemPrevistoRaw[];
  return new Map(filas.map((fila) => [fila.id, fila]));
}

/**
 * Material previsto para un conjunto de ítems ejecutados.
 *
 * NO interviene la planificación mensual: el previsto sale de la cantidad de
 * ítem ejecutada, no de los porcentajes de avance por mes.
 *
 *   cantidad_prevista(insumo) = Σ sobre los ítems de
 *                               cantidad_ejecutada × cantidad_en_receta
 *
 * Es pura: recibe los ítems ya cargados. Así el endpoint de previsto y el
 * listado de certificaciones comparten la cuenta sin repetir consultas.
 *
 * @param pedidos Ítems ejecutados; sin `cantidad_ejecutada` se toma el completo.
 * @param itemsPorId Ítems ya cargados con `cargarItemsParaPrevisto`.
 * @returns Detalle por ítem, insumos agrupados, y los ids que no se encontraron.
 */
export function calcularPrevistoConItems(
  pedidos: CertificacionItemEjecutado[],
  itemsPorId: Map<string, ItemParaPrevisto>,
): {
  items: CertificacionItemPrevisto[];
  insumos: CertificacionInsumoPrevisto[];
  faltantes: string[];
} {
  const porInsumo = new Map<string, CertificacionInsumoPrevisto>();
  const items: CertificacionItemPrevisto[] = [];
  const faltantes: string[] = [];

  for (const pedido of pedidos) {
    const item = itemsPorId.get(pedido.item_id);
    if (!item) {
      // Ítem inexistente o de otra obra. Quien llama decide si es un error
      // (al guardar) o algo a ignorar (al leer lo ya guardado).
      faltantes.push(pedido.item_id);
      continue;
    }

    const cantidadTotal = calcularCantidadTotalItem(item.mediciones);
    const pedida =
      pedido.cantidad_ejecutada === undefined ||
      pedido.cantidad_ejecutada === null
        ? undefined
        : Number(pedido.cantidad_ejecutada);

    // Sin cantidad informada se ejecuta el ítem completo.
    const cantidadEjecutada = pedida === undefined ? cantidadTotal : pedida;

    const ingredientes = item.receta?.ingredientes ?? [];
    const aportaInsumos = ingredientes.length > 0;

    items.push({
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

  return {
    items,
    insumos: Array.from(porInsumo.values()).sort(ordenarPorTipoYNombre),
    faltantes,
  };
}

/** Orden estable compartido: por tipo y, dentro del tipo, por nombre. */
export function ordenarPorTipoYNombre(
  x: { tipo: Insumo["tipo"]; nombre: string },
  y: { tipo: Insumo["tipo"]; nombre: string },
): number {
  return x.tipo === y.tipo
    ? x.nombre.localeCompare(y.nombre, "es")
    : x.tipo.localeCompare(y.tipo);
}

/**
 * Cruza el material previsto contra el real cargado y calcula el desvío.
 *
 *   desvio_cantidad = real − previsto
 *   desvio_pct      = (real − previsto) / previsto × 100
 *
 * Es un cruce completo, no una intersección: un insumo con real y sin previsto
 * (material que las recetas no contemplaban) y uno con previsto y sin real
 * (estaba previsto y no se cargó consumo) son justamente los desvíos que le
 * interesan al encargado, así que aparecen con el otro lado en 0 y marcados
 * en `origen`.
 *
 * Con previsto 0 no se divide: `desvio_pct` queda en null y la vista muestra
 * que no es calculable en porcentaje.
 *
 * Devuelve los tres tipos de insumo etiquetados. Esta fase de certificación es
 * solo de materiales, pero el filtro lo hace la vista: descartar acá obligaría
 * a tocar el backend el día que se sume mano de obra.
 *
 * @param previstos Insumos previstos, ya agrupados.
 * @param reales Insumos realmente consumidos, con el insumo cargado.
 */
export function calcularDesvio(
  previstos: CertificacionInsumoPrevisto[],
  reales: Array<{ insumo: Insumo; cantidad_real: number }>,
): CertificacionDesvioInsumo[] {
  const porInsumo = new Map<string, CertificacionDesvioInsumo>();

  for (const previsto of previstos) {
    porInsumo.set(previsto.insumo_id, {
      insumo_id: previsto.insumo_id,
      nombre: previsto.nombre,
      unidad_medida: previsto.unidad_medida,
      tipo: previsto.tipo,
      precio_unitario: previsto.precio_unitario,
      cantidad_prevista: previsto.cantidad_prevista,
      cantidad_real: 0,
      desvio_cantidad: 0,
      desvio_pct: null,
      origen: "solo_previsto",
    });
  }

  for (const { insumo, cantidad_real } of reales) {
    const cantidadReal = Number(cantidad_real);
    const fila = porInsumo.get(insumo.id);
    if (fila) {
      fila.cantidad_real = cantidadReal;
      fila.origen = "ambos";
    } else {
      porInsumo.set(insumo.id, {
        ...metadatosInsumo(insumo),
        cantidad_prevista: 0,
        cantidad_real: cantidadReal,
        desvio_cantidad: 0,
        desvio_pct: null,
        origen: "solo_real",
      });
    }
  }

  for (const fila of porInsumo.values()) {
    fila.desvio_cantidad = fila.cantidad_real - fila.cantidad_prevista;
    // Sin previsto no hay base contra la cual medir un porcentaje.
    fila.desvio_pct =
      fila.cantidad_prevista > 0
        ? (fila.desvio_cantidad / fila.cantidad_prevista) * 100
        : null;
  }

  return Array.from(porInsumo.values()).sort(ordenarPorTipoYNombre);
}

/* ─── Validación del payload (compartida por POST y PUT) ───────────────────── */

/** Payload ya normalizado: fecha limpia, ítems como objetos y cantidades numéricas. */
export interface PayloadCertificacion {
  fecha: string;
  descripcion: string | null;
  items: CertificacionItemEjecutado[];
  insumos: Array<{ insumo_id: string; cantidad_real: number }>;
}

export type ResultadoValidacion =
  | { ok: true; datos: PayloadCertificacion }
  | { ok: false; error: string };

const FORMATO_FECHA = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Valida y normaliza el cuerpo de una certificación.
 *
 * Los mensajes de error salen tal cual a la pantalla, así que nombran el dato
 * concreto que está mal (qué ítem se repite, qué insumo tiene cantidad
 * negativa) en vez de un "payload inválido" genérico.
 *
 * No valida pertenencia de ítems ni existencia de insumos: eso necesita ir a
 * la base y lo hace el route handler.
 *
 * @param body Cuerpo crudo del request.
 * @param obligarObraId true en POST (la obra viene en el body); false en PUT,
 *   donde la obra es la que ya tiene la certificación y no se puede cambiar.
 */
export function validarPayloadCertificacion(
  body: unknown,
  obligarObraId: boolean,
): ResultadoValidacion {
  const payload = (body ?? {}) as {
    obra_id?: unknown;
    fecha?: unknown;
    descripcion?: unknown;
    items?: unknown;
    insumos?: unknown;
  };

  if (obligarObraId) {
    if (typeof payload.obra_id !== "string" || payload.obra_id.trim() === "") {
      return { ok: false, error: "El obra_id es obligatorio" };
    }
  }

  // La fecha es libre (la elige el encargado), pero tiene que ser una fecha.
  if (typeof payload.fecha !== "string" || !FORMATO_FECHA.test(payload.fecha)) {
    return { ok: false, error: "La fecha es obligatoria, con formato AAAA-MM-DD" };
  }
  // `new Date("2026-02-31")` NO da inválido: JS corre el día sobrante al mes
  // siguiente. Se compara el ida y vuelta para cazar los días que no existen.
  const [anio, mes, dia] = payload.fecha.split("-").map(Number);
  const fechaParseada = new Date(Date.UTC(anio, mes - 1, dia));
  if (
    Number.isNaN(fechaParseada.getTime()) ||
    fechaParseada.getUTCFullYear() !== anio ||
    fechaParseada.getUTCMonth() !== mes - 1 ||
    fechaParseada.getUTCDate() !== dia
  ) {
    return { ok: false, error: `La fecha ${payload.fecha} no existe` };
  }

  if (
    payload.descripcion !== undefined &&
    payload.descripcion !== null &&
    typeof payload.descripcion !== "string"
  ) {
    return { ok: false, error: "La descripción tiene que ser texto" };
  }
  const descripcionLimpia =
    typeof payload.descripcion === "string" && payload.descripcion.trim() !== ""
      ? payload.descripcion.trim()
      : null;

  // ── Ítems ejecutados ──────────────────────────────────────────────
  if (!Array.isArray(payload.items) || payload.items.length === 0) {
    return { ok: false, error: "Hay que seleccionar al menos un ítem ejecutado" };
  }

  const items: CertificacionItemEjecutado[] = [];
  const itemsVistos = new Set<string>();

  for (const entrada of payload.items) {
    // Se acepta el id suelto o el objeto con la cantidad parcial.
    const crudo =
      typeof entrada === "string"
        ? { item_id: entrada, cantidad_ejecutada: undefined }
        : (entrada as CertificacionItemEjecutado | null);

    const itemId = crudo?.item_id;
    if (typeof itemId !== "string" || itemId.trim() === "") {
      return { ok: false, error: "Cada ítem tiene que traer un item_id" };
    }

    if (itemsVistos.has(itemId)) {
      return { ok: false, error: `El ítem ${itemId} está repetido en la lista` };
    }
    itemsVistos.add(itemId);

    const cruda = crudo?.cantidad_ejecutada;
    if (cruda === undefined || cruda === null) {
      items.push({ item_id: itemId });
      continue;
    }

    const cantidad = Number(cruda);
    if (!Number.isFinite(cantidad) || cantidad < 0) {
      return {
        ok: false,
        error: `La cantidad ejecutada del ítem ${itemId} tiene que ser un número mayor o igual a 0`,
      };
    }
    items.push({ item_id: itemId, cantidad_ejecutada: cantidad });
  }

  // ── Material real consumido ───────────────────────────────────────
  // Puede venir vacío: se permite registrar la ejecución y cargar el material
  // después, editando la certificación.
  if (payload.insumos !== undefined && !Array.isArray(payload.insumos)) {
    return { ok: false, error: "El material real tiene que ser una lista" };
  }

  const insumos: Array<{ insumo_id: string; cantidad_real: number }> = [];
  const insumosVistos = new Set<string>();

  for (const entrada of (payload.insumos ?? []) as Array<{
    insumo_id?: unknown;
    cantidad_real?: unknown;
  }>) {
    const insumoId = entrada?.insumo_id;
    if (typeof insumoId !== "string" || insumoId.trim() === "") {
      return { ok: false, error: "Cada material tiene que traer un insumo_id" };
    }

    if (insumosVistos.has(insumoId)) {
      return {
        ok: false,
        error: `El insumo ${insumoId} está repetido en el material real`,
      };
    }
    insumosVistos.add(insumoId);

    const cantidad = Number(entrada.cantidad_real);
    if (
      entrada.cantidad_real === undefined ||
      entrada.cantidad_real === null ||
      !Number.isFinite(cantidad)
    ) {
      return {
        ok: false,
        error: `La cantidad real del insumo ${insumoId} tiene que ser un número`,
      };
    }
    if (cantidad < 0) {
      return {
        ok: false,
        error: `La cantidad real del insumo ${insumoId} no puede ser negativa`,
      };
    }
    insumos.push({ insumo_id: insumoId, cantidad_real: cantidad });
  }

  return {
    ok: true,
    datos: { fecha: payload.fecha, descripcion: descripcionLimpia, items, insumos },
  };
}

/* ─── Lectura de certificaciones con su desvío ─────────────────────────────── */

// Shape crudo de la lectura anidada de una certificación.
type CertificacionRaw = Certificacion & {
  items: Array<{ item_id: string; cantidad_ejecutada: number | null }>;
  insumos: Array<{
    insumo_id: string;
    cantidad_real: number;
    insumo: Insumo | null;
  }>;
};

const CERTIFICACION_SELECT_BASE = (conCantidad: boolean) => `
  id,
  obra_id,
  fecha,
  descripcion,
  created_at,
  updated_at,
  items:certificacion_items (
    item_id${conCantidad ? ",\n    cantidad_ejecutada" : ""}
  ),
  insumos:certificacion_insumos (
    insumo_id,
    cantidad_real,
    insumo:insumos (*)
  )
`;

// 42703 = la columna cantidad_ejecutada todavía no existe porque falta correr
// la migración 011. Se recuerda para no repetir la consulta fallida en cada
// request; se resetea solo al reiniciar el server, que es cuando corresponde
// después de aplicar la migración.
let faltaCantidadEjecutada = false;

/**
 * Trae certificaciones con su detalle y su desvío ya calculado.
 *
 * El desvío NO se guarda: se recalcula acá cruzando el previsto de las recetas
 * de los ítems ejecutados contra el material real cargado. Así, si cambia una
 * receta o una medición, el desvío se actualiza solo.
 *
 * Los ítems de todas las certificaciones se cargan en una sola consulta, para
 * que listar una obra con muchas certificaciones no dispare un N+1.
 *
 * @param supabase Cliente de servidor (el RLS filtra por usuario).
 * @param filtro Por obra (listado) o por id (una sola).
 */
export async function cargarCertificacionesConDesvio(
  supabase: SupabaseServer,
  filtro: { obraId: string } | { id: string },
): Promise<CertificacionConDesvio[]> {
  const consultar = async (conCantidad: boolean) => {
    let query = supabase
      .from("certificaciones")
      .select(CERTIFICACION_SELECT_BASE(conCantidad));

    query =
      "obraId" in filtro
        ? query.eq("obra_id", filtro.obraId)
        : query.eq("id", filtro.id);

    // Orden cronológico, como un registro de ejecuciones de la obra.
    return query
      .order("fecha", { ascending: true })
      .order("created_at", { ascending: true });
  };

  let { data, error } = await consultar(!faltaCantidadEjecutada);

  // La 011 se aplica a mano y puede ir por detrás del deploy: en vez de romper
  // entero, se relee sin la columna y todos los ítems valen como completos.
  if (error && error.code === "42703" && !faltaCantidadEjecutada) {
    console.warn(
      "[certificacion] Falta la columna certificacion_items.cantidad_ejecutada: " +
        "ejecutá supabase/migrations/011_certificacion_cantidad_ejecutada.sql. " +
        "Hasta entonces todos los ítems se calculan como ejecutados completos.",
    );
    faltaCantidadEjecutada = true;
    ({ data, error } = await consultar(false));
  }

  if (error) throw error;

  const certificaciones = (data ?? []) as unknown as CertificacionRaw[];
  if (certificaciones.length === 0) return [];

  // Una consulta de ítems por obra, no una por certificación.
  const itemIdsPorObra = new Map<string, Set<string>>();
  for (const cert of certificaciones) {
    const set = itemIdsPorObra.get(cert.obra_id) ?? new Set<string>();
    for (const it of cert.items) set.add(it.item_id);
    itemIdsPorObra.set(cert.obra_id, set);
  }

  const itemsPorObra = new Map<string, Map<string, ItemParaPrevisto>>();
  for (const [obraId, ids] of itemIdsPorObra) {
    itemsPorObra.set(
      obraId,
      await cargarItemsParaPrevisto(supabase, obraId, Array.from(ids)),
    );
  }

  return certificaciones.map((cert) => {
    const itemsPorId = itemsPorObra.get(cert.obra_id) ?? new Map();

    const pedidos: CertificacionItemEjecutado[] = cert.items.map((it) => ({
      item_id: it.item_id,
      // null = ítem completo.
      cantidad_ejecutada: it.cantidad_ejecutada ?? undefined,
    }));

    // Acá los faltantes se ignoran a propósito: al leer lo ya guardado, un
    // ítem que no resuelve no es culpa de quien consulta. Al guardar sí es
    // error, y eso lo valida el route handler.
    const previsto = calcularPrevistoConItems(pedidos, itemsPorId);

    // Un insumo borrado deja la fila huérfana sin poder resolverse: se saltea
    // en vez de romper la lectura de toda la certificación.
    const realesResueltos = cert.insumos.filter(
      (fila): fila is typeof fila & { insumo: Insumo } => fila.insumo !== null,
    );

    const insumosReales: CertificacionInsumoReal[] = realesResueltos
      .map((fila) => ({
        ...metadatosInsumo(fila.insumo),
        cantidad_real: Number(fila.cantidad_real),
      }))
      .sort(ordenarPorTipoYNombre);

    const desvio = calcularDesvio(
      previsto.insumos,
      realesResueltos.map((fila) => ({
        insumo: fila.insumo,
        cantidad_real: Number(fila.cantidad_real),
      })),
    );

    return {
      id: cert.id,
      obra_id: cert.obra_id,
      fecha: cert.fecha,
      descripcion: cert.descripcion,
      created_at: cert.created_at,
      updated_at: cert.updated_at,
      items: previsto.items,
      insumos_previstos: previsto.insumos,
      insumos_reales: insumosReales,
      desvio,
    };
  });
}

/**
 * Inserta los ítems y el material real de una certificación.
 *
 * Lo usan el POST (después de crear la cabecera) y el PUT (después de borrar
 * los hijos viejos), que es el mismo enfoque de reemplazo total que usa el PUT
 * de recetas con sus ingredientes.
 *
 * @returns El mensaje de error si algo falló, o null si salió todo bien.
 */
export async function insertarHijosCertificacion(
  supabase: SupabaseServer,
  certificacionId: string,
  items: CertificacionItemEjecutado[],
  insumos: Array<{ insumo_id: string; cantidad_real: number }>,
): Promise<string | null> {
  const filasItems = items.map((item) => ({
    certificacion_id: certificacionId,
    item_id: item.item_id,
    // null = ítem completo; la cantidad sale de las mediciones al leer.
    cantidad_ejecutada: item.cantidad_ejecutada ?? null,
  }));

  let { error: errorItems } = await supabase
    .from("certificacion_items")
    .insert(faltaCantidadEjecutada ? filasItems.map(sinCantidad) : filasItems);

  // Mismo caso que en la lectura: falta correr la 011. Se reintenta sin la
  // columna, avisando, en vez de dejar al encargado sin poder guardar.
  if (errorItems && errorItems.code === "42703") {
    if (!faltaCantidadEjecutada) {
      console.warn(
        "[certificacion] Falta la columna certificacion_items.cantidad_ejecutada: " +
          "ejecutá supabase/migrations/011_certificacion_cantidad_ejecutada.sql. " +
          "Las cantidades parciales no se guardan hasta entonces.",
      );
      faltaCantidadEjecutada = true;
    }
    ({ error: errorItems } = await supabase
      .from("certificacion_items")
      .insert(filasItems.map(sinCantidad)));
  }

  if (errorItems) return errorItems.message;

  if (insumos.length > 0) {
    const { error: errorInsumos } = await supabase
      .from("certificacion_insumos")
      .insert(
        insumos.map((insumo) => ({
          certificacion_id: certificacionId,
          insumo_id: insumo.insumo_id,
          cantidad_real: insumo.cantidad_real,
        })),
      );

    if (errorInsumos) return errorInsumos.message;
  }

  return null;
}

function sinCantidad(fila: {
  certificacion_id: string;
  item_id: string;
  cantidad_ejecutada: number | null;
}) {
  return { certificacion_id: fila.certificacion_id, item_id: fila.item_id };
}

/** ¿Existen todos estos insumos (y son del usuario)? Devuelve los que no.
 *
 *  El RLS de `insumos` ya filtra por usuario, así que un insumo ajeno cae acá
 *  como inexistente, que es la respuesta correcta desde afuera. */
export async function detectarInsumosInexistentes(
  supabase: SupabaseServer,
  insumoIds: string[],
): Promise<string[]> {
  if (insumoIds.length === 0) return [];

  const { data, error } = await supabase
    .from("insumos")
    .select("id")
    .in("id", insumoIds);

  if (error) throw error;

  const existentes = new Set((data ?? []).map((fila) => fila.id));
  return insumoIds.filter((id) => !existentes.has(id));
}
