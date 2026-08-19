// Solo se usa para tipar el cliente: import type para no arrastrar
// next/headers al runtime de quien importe las funciones puras de este módulo.
import type { createSupabaseServerClient } from "./supabaseServer";
import {
  calcularCantidadMedicion,
  calcularCantidadTotalItem,
  calcularConsumoIngredientes,
  metadatosInsumo,
  resolverCompra,
} from "./calculos";
import { cargarOverridesCompra, type OverrideCompra } from "./compra";
import { validarFechaISO } from "./fecha";
import type {
  Insumo,
  Item,
  RecetaConInsumos,
  Certificacion,
  CertificacionConDesvio,
  CertificacionDesvioComputo,
  CertificacionDesvioComputoItem,
  CertificacionDesvioComputoRubro,
  CertificacionItemEjecutado,
  CertificacionItemPrevisto,
  CertificacionInsumoPrevisto,
  CertificacionInsumoReal,
  CertificacionDesvioInsumo,
  CertificacionMedicionDesvio,
  MedidaRealEntrada,
  MedidasComputo,
} from "../types";

type SupabaseServer = ReturnType<typeof createSupabaseServerClient>;

/** Una medición del cómputo, con las dimensiones que necesita el desvío de
 *  cómputo para mostrar "se midió 4 × 13,70 × 0,20 × 3,00". */
export type MedicionParaComputo = {
  id: string;
  descripcion: string;
  n: number;
  largo: number | null;
  ancho: number | null;
  alto: number | null;
  cantidad_calculada: number;
};

/** Un ítem con lo necesario para calcular su previsto: la receta y las
 *  mediciones de las que sale su cantidad total.
 *
 *  Las mediciones vienen con id y dimensiones (no solo la cantidad) porque el
 *  desvío de cómputo las necesita para cruzarlas contra las medidas reales, y
 *  el rubro viaja con nombre para poder agrupar sin una consulta más. */
export type ItemParaPrevisto = Pick<
  Item,
  "id" | "descripcion" | "unidad_medida"
> & {
  rubro: { id: string; nombre: string; obra_id: string } | null;
  receta: RecetaConInsumos | null;
  mediciones: MedicionParaComputo[];
};

// Shape crudo que devuelve PostgREST para el select de abajo.
type ItemPrevistoRaw = ItemParaPrevisto;

const ITEM_PREVISTO_SELECT = `
  id,
  descripcion,
  unidad_medida,
  rubro:rubros!inner (
    id,
    nombre,
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
    id,
    descripcion,
    n,
    largo,
    ancho,
    alto,
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
 * MEDIDAS REALES: si una medición del ítem salió distinta de como se midió, la
 * cantidad que se usa acá es la REAL, no la del cómputo. Una pared más larga
 * lleva más ladrillos, y el desvío de material tiene que medir el consumo, no
 * el error de medición. El ajuste llega ya sumado por ítem en `ajustesPorItem`
 * (lo calcula `calcularDesvioComputo`) y NO se persiste: se recalcula al leer.
 *
 * @param pedidos Ítems ejecutados; sin `cantidad_ejecutada` se toma el completo.
 * @param itemsPorId Ítems ya cargados con `cargarItemsParaPrevisto`.
 * @param overrides Overrides de compra de la obra, para resolver el factor con
 *   la misma precedencia que la explosión. Sin overrides vale la referencia.
 * @param ajustesPorItem item_id → Σ (real − planificada) de sus mediciones con
 *   medida real. Vacío = nadie corrigió medidas y el previsto sale del cómputo.
 * @returns Detalle por ítem, insumos agrupados, y los ids que no se encontraron.
 */
export function calcularPrevistoConItems(
  pedidos: CertificacionItemEjecutado[],
  itemsPorId: Map<string, ItemParaPrevisto>,
  overrides: Map<string, OverrideCompra> = new Map(),
  ajustesPorItem: Map<string, number> = new Map(),
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
    const cantidadPlanificada = pedida === undefined ? cantidadTotal : pedida;

    // El ajuste ya viene con signo: negativo si las paredes salieron más
    // chicas. No puede bajar de 0 porque cada medición aporta como mucho
    // −planificada, pero se acota igual: una cantidad negativa daría un
    // previsto negativo, que no significa nada.
    const ajuste = ajustesPorItem.get(item.id) ?? 0;
    const cantidadEjecutada = Math.max(0, cantidadPlanificada + ajuste);

    const ingredientes = item.receta?.ingredientes ?? [];
    const aportaInsumos = ingredientes.length > 0;

    items.push({
      item_id: item.id,
      descripcion: item.descripcion,
      unidad_medida: item.unidad_medida,
      cantidad_total: cantidadTotal,
      cantidad_ejecutada: cantidadEjecutada,
      cantidad_planificada: cantidadPlanificada,
      ajuste_medidas_reales: cantidadEjecutada - cantidadPlanificada,
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
          // Misma resolución referencia/override que la explosión.
          ...resolverCompra(insumo, overrides.get(insumo.id) ?? null),
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
 * Todo se compara en unidad BASE: `cantidad_real` se guarda en unidad base
 * justamente para que el cruce no dependa de en qué unidad se cargó. La
 * conversión a unidad de compra viaja resuelta para que la vista la muestre.
 *
 * @param previstos Insumos previstos, ya agrupados y con la compra resuelta.
 * @param reales Insumos realmente consumidos (unidad base), con el insumo cargado.
 * @param overrides Overrides de compra de la obra, para los insumos que tienen
 *   real y no previsto (no vienen con la compra ya resuelta).
 */
export function calcularDesvio(
  previstos: CertificacionInsumoPrevisto[],
  reales: Array<{ insumo: Insumo; cantidad_real: number }>,
  overrides: Map<string, OverrideCompra> = new Map(),
): CertificacionDesvioInsumo[] {
  const porInsumo = new Map<string, CertificacionDesvioInsumo>();

  for (const previsto of previstos) {
    porInsumo.set(previsto.insumo_id, {
      insumo_id: previsto.insumo_id,
      nombre: previsto.nombre,
      unidad_medida: previsto.unidad_medida,
      tipo: previsto.tipo,
      precio_unitario: previsto.precio_unitario,
      unidad_compra: previsto.unidad_compra,
      factor_compra: previsto.factor_compra,
      factor_origen: previsto.factor_origen,
      factor_referencia: previsto.factor_referencia,
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
        ...resolverCompra(insumo, overrides.get(insumo.id) ?? null),
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

/* ─── Desvío de CÓMPUTO (medida planificada vs medida real) ───────────────── */

/** Una fila de `mediciones_reales` ya normalizada.
 *
 *  `cantidad_calculada` es la columna GENERATED cuando la fila viene de la
 *  base, y el cálculo en JS con la misma fórmula cuando todavía no se guardó
 *  (la previsualización del endpoint de previsto). Nunca se INSERTA. */
export interface MedidaRealResuelta {
  medicion_id: string;
  n: number | null;
  largo: number | null;
  ancho: number | null;
  alto: number | null;
  cantidad_calculada: number | null;
}

/** Fila lista para insertar en `mediciones_reales`: sin `cantidad_calculada`,
 *  que la calcula la base. */
export interface FilaMedicionReal {
  medicion_id: string;
  n: number | null;
  largo: number | null;
  ancho: number | null;
  alto: number | null;
}

function aNumeroONulo(valor: unknown): number | null {
  if (valor === null || valor === undefined) return null;
  const numero = Number(valor);
  return Number.isFinite(numero) ? numero : null;
}

/** Dimensiones + cantidad de un juego de medidas, para que la vista muestre
 *  "4 × 13,70 × 0,20 × 3,00 = 32,88" sin recalcular nada. */
function armarMedidas(
  n: number | null,
  largo: number | null,
  ancho: number | null,
  alto: number | null,
  cantidadGuardada: number | null,
): MedidasComputo {
  // `n` en NULL solo puede venir de una fila cargada a mano: el backend
  // siempre lo escribe. Se toma como 1, igual que hace COALESCE con el resto.
  const cantidadN = n ?? 1;
  return {
    n: cantidadN,
    largo,
    ancho,
    alto,
    cantidad:
      cantidadGuardada !== null && Number.isFinite(cantidadGuardada)
        ? cantidadGuardada
        : calcularCantidadMedicion(
            cantidadN,
            largo ?? undefined,
            ancho ?? undefined,
            alto ?? undefined,
          ),
  };
}

/**
 * Desvío de cómputo de una certificación: qué se midió contra qué salió.
 *
 * Es pura y sirve a los dos caminos: la lectura de una certificación guardada
 * (las medidas reales salen de `mediciones_reales`) y la previsualización
 * antes de guardar (salen del body). Así el número de la pantalla de Registrar
 * y el del Histórico no pueden discrepar.
 *
 * Solo entran las mediciones que el ítem declaró como ejecutadas
 * (`medicion_ids`). Un ítem certificado sin detalle de mediciones —el
 * comportamiento anterior a la migración 012— no aporta filas: no hay contra
 * qué comparar. Una medición borrada del cómputo después de certificar
 * tampoco: se saltea en vez de romper la lectura.
 *
 * Sin medida real, la cantidad real se asume igual a la planificada y el
 * desvío da 0. Ausencia de fila = "salió como se midió", no dato faltante.
 *
 * @param pedidos Ítems ejecutados, con sus `medicion_ids`.
 * @param itemsPorId Ítems ya cargados con `cargarItemsParaPrevisto`.
 * @param reales medicion_id → medidas reales cargadas.
 * @returns El desvío en sus tres niveles y el ajuste por ítem que consume
 *   `calcularPrevistoConItems` para recalcular el previsto de material.
 */
export function calcularDesvioComputo(
  pedidos: CertificacionItemEjecutado[],
  itemsPorId: Map<string, ItemParaPrevisto>,
  reales: Map<string, MedidaRealResuelta>,
): { desvio: CertificacionDesvioComputo; ajustesPorItem: Map<string, number> } {
  const mediciones: CertificacionMedicionDesvio[] = [];
  const ajustesPorItem = new Map<string, number>();

  for (const pedido of pedidos) {
    const item = itemsPorId.get(pedido.item_id);
    if (!item || !pedido.medicion_ids || pedido.medicion_ids.length === 0) {
      continue;
    }

    const medicionesDelItem = new Map(item.mediciones.map((m) => [m.id, m]));

    for (const medicionId of pedido.medicion_ids) {
      const planificadaCruda = medicionesDelItem.get(medicionId);
      // La medición ya no existe en el cómputo (se borró después de
      // certificar): no hay planificado contra el cual comparar.
      if (!planificadaCruda) continue;

      const planificada = armarMedidas(
        aNumeroONulo(planificadaCruda.n),
        aNumeroONulo(planificadaCruda.largo),
        aNumeroONulo(planificadaCruda.ancho),
        aNumeroONulo(planificadaCruda.alto),
        aNumeroONulo(planificadaCruda.cantidad_calculada),
      );

      const realCruda = reales.get(medicionId);
      const real = realCruda
        ? armarMedidas(
            aNumeroONulo(realCruda.n),
            aNumeroONulo(realCruda.largo),
            aNumeroONulo(realCruda.ancho),
            aNumeroONulo(realCruda.alto),
            aNumeroONulo(realCruda.cantidad_calculada),
          )
        : null;

      // Sin medida real, salió como se midió.
      const cantidadReal = real ? real.cantidad : planificada.cantidad;
      const desvioCantidad = cantidadReal - planificada.cantidad;

      mediciones.push({
        medicion_id: medicionId,
        item_id: item.id,
        rubro_id: item.rubro?.id ?? "",
        rubro_nombre: item.rubro?.nombre ?? "",
        descripcion: planificadaCruda.descripcion,
        unidad_medida: item.unidad_medida,
        planificada,
        real,
        cantidad_planificada: planificada.cantidad,
        cantidad_real: cantidadReal,
        desvio_cantidad: desvioCantidad,
        // Sin planificado no hay base contra la cual medir un porcentaje.
        desvio_pct:
          planificada.cantidad > 0
            ? (desvioCantidad / planificada.cantidad) * 100
            : null,
      });

      if (real) {
        ajustesPorItem.set(
          item.id,
          (ajustesPorItem.get(item.id) ?? 0) + desvioCantidad,
        );
      }
    }
  }

  const items = consolidarPorItem(mediciones, itemsPorId);

  return {
    desvio: {
      mediciones,
      items,
      rubros: agruparPorRubro(items),
      mediciones_con_medida_real: mediciones.filter((m) => m.real !== null)
        .length,
    },
    ajustesPorItem,
  };
}

/** Suma las mediciones de cada ítem. Es legítimo sumar acá: todas comparten la
 *  unidad del ítem. */
function consolidarPorItem(
  mediciones: CertificacionMedicionDesvio[],
  itemsPorId: Map<string, ItemParaPrevisto>,
): CertificacionDesvioComputoItem[] {
  const porItem = new Map<string, CertificacionDesvioComputoItem>();

  for (const fila of mediciones) {
    let acum = porItem.get(fila.item_id);
    if (!acum) {
      acum = {
        item_id: fila.item_id,
        descripcion: itemsPorId.get(fila.item_id)?.descripcion ?? "",
        unidad_medida: fila.unidad_medida,
        rubro_id: fila.rubro_id,
        rubro_nombre: fila.rubro_nombre,
        mediciones: 0,
        mediciones_con_medida_real: 0,
        cantidad_planificada: 0,
        cantidad_real: 0,
        desvio_cantidad: 0,
        desvio_pct: null,
      };
      porItem.set(fila.item_id, acum);
    }

    acum.mediciones += 1;
    if (fila.real !== null) acum.mediciones_con_medida_real += 1;
    acum.cantidad_planificada += fila.cantidad_planificada;
    acum.cantidad_real += fila.cantidad_real;
  }

  for (const acum of porItem.values()) {
    acum.desvio_cantidad = acum.cantidad_real - acum.cantidad_planificada;
    acum.desvio_pct =
      acum.cantidad_planificada > 0
        ? (acum.desvio_cantidad / acum.cantidad_planificada) * 100
        : null;
  }

  return Array.from(porItem.values());
}

/** Agrupa los ítems por rubro. Sin total de cantidad: un rubro mezcla m2, m3 y
 *  u, y esa suma no significaría nada. */
function agruparPorRubro(
  items: CertificacionDesvioComputoItem[],
): CertificacionDesvioComputoRubro[] {
  const porRubro = new Map<string, CertificacionDesvioComputoRubro>();

  for (const item of items) {
    const acum = porRubro.get(item.rubro_id);
    if (acum) {
      acum.items.push(item);
    } else {
      porRubro.set(item.rubro_id, {
        rubro_id: item.rubro_id,
        rubro_nombre: item.rubro_nombre,
        items: [item],
        items_con_desvio: 0,
      });
    }
  }

  for (const rubro of porRubro.values()) {
    rubro.items_con_desvio = rubro.items.filter(
      (item) => item.desvio_cantidad !== 0,
    ).length;
  }

  return Array.from(porRubro.values());
}

/**
 * Valida y completa las medidas reales de un pedido contra el cómputo.
 *
 * Dos reglas que no se pueden chequear sin ir a la base, y por eso viven acá y
 * no en `validarPayloadCertificacion`:
 *
 *  1. La medición tiene que pertenecer al ítem.
 *  2. La medición tiene que estar entre las EJECUTADAS de ese ítem. No se
 *     acepta la medida real de una pared que no se certificó.
 *
 * Además hereda del cómputo cada dimensión que no vino: corregir solo el largo
 * no puede dejar el ancho y el alto en NULL, porque COALESCE los tomaría como
 * 1 y la cantidad real saldría de otro planeta. Un `null` explícito sí borra.
 *
 * @returns Las filas listas para insertar (sin `cantidad_calculada`, que es
 *   GENERATED) o el mensaje de error para la pantalla.
 */
export function resolverMedidasReales(
  pedidos: CertificacionItemEjecutado[],
  itemsPorId: Map<string, ItemParaPrevisto>,
):
  | { ok: true; filas: FilaMedicionReal[] }
  | { ok: false; error: string } {
  const filas: FilaMedicionReal[] = [];

  for (const pedido of pedidos) {
    const medidas = pedido.medidas_reales ?? [];
    if (medidas.length === 0) continue;

    const item = itemsPorId.get(pedido.item_id);
    if (!item) {
      return {
        ok: false,
        error: `El ítem ${pedido.item_id} no existe o no pertenece a la obra`,
      };
    }

    const ejecutadas = new Set(pedido.medicion_ids ?? []);
    const medicionesDelItem = new Map(item.mediciones.map((m) => [m.id, m]));

    for (const medida of medidas) {
      const planificada = medicionesDelItem.get(medida.medicion_id);
      if (!planificada) {
        return {
          ok: false,
          error:
            `La medición ${medida.medicion_id} no pertenece al ítem ` +
            `"${item.descripcion}"`,
        };
      }

      if (!ejecutadas.has(medida.medicion_id)) {
        return {
          ok: false,
          error:
            `No se pueden cargar medidas reales de "${planificada.descripcion}": ` +
            `esa medición no está entre las ejecutadas del ítem "${item.descripcion}"`,
        };
      }

      // Dimensión ausente = la del cómputo; null explícito = se borra.
      const heredar = (
        valor: number | null | undefined,
        delComputo: number | null,
      ) => (valor === undefined ? delComputo : aNumeroONulo(valor));

      filas.push({
        medicion_id: medida.medicion_id,
        n: heredar(medida.n, aNumeroONulo(planificada.n)),
        largo: heredar(medida.largo, aNumeroONulo(planificada.largo)),
        ancho: heredar(medida.ancho, aNumeroONulo(planificada.ancho)),
        alto: heredar(medida.alto, aNumeroONulo(planificada.alto)),
      });
    }
  }

  return { ok: true, filas };
}

/** Las mismas filas, ya con la cantidad calculada en JS, para previsualizar el
 *  desvío antes de guardar. Replica la columna GENERATED; la base sigue siendo
 *  la fuente de verdad una vez guardado. */
export function aMedidasResueltas(
  filas: FilaMedicionReal[],
): Map<string, MedidaRealResuelta> {
  return new Map(
    filas.map((fila) => [
      fila.medicion_id,
      {
        ...fila,
        cantidad_calculada: calcularCantidadMedicion(
          fila.n ?? 1,
          fila.largo ?? undefined,
          fila.ancho ?? undefined,
          fila.alto ?? undefined,
        ),
      },
    ]),
  );
}

/**
 * Valida la forma de `medidas_reales` de un ítem (sin ir a la base).
 *
 * La pertenencia y la herencia de dimensiones las resuelve
 * `resolverMedidasReales`, que sí necesita el cómputo cargado.
 */
export function validarMedidasRealesEntrada(
  crudo: unknown,
  itemId: string,
): { ok: true; medidas: MedidaRealEntrada[] } | { ok: false; error: string } {
  if (!Array.isArray(crudo)) {
    return {
      ok: false,
      error: `Las medidas reales del ítem ${itemId} tienen que ser una lista`,
    };
  }

  const medidas: MedidaRealEntrada[] = [];
  const vistas = new Set<string>();

  for (const entrada of crudo as Array<Record<string, unknown>>) {
    const medicionId = entrada?.medicion_id;
    if (typeof medicionId !== "string" || medicionId.trim() === "") {
      return {
        ok: false,
        error: `Cada medida real del ítem ${itemId} tiene que traer un medicion_id`,
      };
    }

    // Una medición con dos juegos de medidas reales sería ambiguo, y el UNIQUE
    // (certificacion_id, medicion_id) lo rechazaría igual desde la base.
    if (vistas.has(medicionId)) {
      return {
        ok: false,
        error: `La medición ${medicionId} tiene medidas reales repetidas`,
      };
    }
    vistas.add(medicionId);

    const medida: MedidaRealEntrada = { medicion_id: medicionId };

    for (const campo of ["n", "largo", "ancho", "alto"] as const) {
      const valor = entrada[campo];
      if (valor === undefined) continue;
      if (valor === null || valor === "") {
        medida[campo] = null;
        continue;
      }

      const numero = Number(valor);
      if (!Number.isFinite(numero) || numero < 0) {
        return {
          ok: false,
          error:
            `El ${campo} real de la medición ${medicionId} tiene que ser un ` +
            `número mayor o igual a 0`,
        };
      }
      medida[campo] = numero;
    }

    medidas.push(medida);
  }

  return { ok: true, medidas };
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
  // El chequeo del día inexistente (31 de febrero) vive en lib/fecha.ts,
  // compartido con el registro de compras.
  const fecha = validarFechaISO(payload.fecha);
  if (!fecha.ok) return { ok: false, error: fecha.error };

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

    // Mediciones ejecutadas (opcional): solo se guardan, no entran al cálculo.
    let medicionIds: string[] | undefined;
    if (crudo && crudo.medicion_ids !== undefined) {
      if (!Array.isArray(crudo.medicion_ids)) {
        return { ok: false, error: `Las mediciones del ítem ${itemId} tienen que ser una lista` };
      }
      const vistas = new Set<string>();
      for (const medicionId of crudo.medicion_ids) {
        if (typeof medicionId !== "string" || medicionId.trim() === "") {
          return { ok: false, error: `El ítem ${itemId} tiene una medición sin id` };
        }
        if (vistas.has(medicionId)) {
          return {
            ok: false,
            error: `La medición ${medicionId} está repetida en el ítem ${itemId}`,
          };
        }
        vistas.add(medicionId);
      }
      medicionIds = Array.from(vistas);
    }

    // Medidas reales (opcional): con qué medidas salieron de verdad algunas de
    // esas mediciones. Que pertenezcan al ítem y estén entre las ejecutadas se
    // chequea contra la base, en `resolverMedidasReales`.
    let medidasReales: MedidaRealEntrada[] | undefined;
    if (crudo && crudo.medidas_reales !== undefined && crudo.medidas_reales !== null) {
      const validadas = validarMedidasRealesEntrada(crudo.medidas_reales, itemId);
      if (!validadas.ok) return { ok: false, error: validadas.error };
      medidasReales = validadas.medidas;
    }

    const cruda = crudo?.cantidad_ejecutada;
    if (cruda === undefined || cruda === null) {
      items.push({
        item_id: itemId,
        medicion_ids: medicionIds,
        medidas_reales: medidasReales,
      });
      continue;
    }

    const cantidad = Number(cruda);
    if (!Number.isFinite(cantidad) || cantidad < 0) {
      return {
        ok: false,
        error: `La cantidad ejecutada del ítem ${itemId} tiene que ser un número mayor o igual a 0`,
      };
    }
    items.push({
      item_id: itemId,
      cantidad_ejecutada: cantidad,
      medicion_ids: medicionIds,
      medidas_reales: medidasReales,
    });
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
    datos: { fecha: fecha.fecha, descripcion: descripcionLimpia, items, insumos },
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

// Ídem para la tabla certificacion_mediciones (migración 012).
let faltaTablaMediciones = false;

// Ídem para la tabla mediciones_reales (migración 014).
let faltaTablaMedidasReales = false;

/**
 * Qué mediciones se ejecutaron en cada certificación.
 *
 * Va en su propia consulta y no anidada en el select de certificaciones para
 * que, si falta la migración 012, el error caiga acá y no se lleve puesta la
 * lectura entera: sin este dato el desvío de material sigue estando bien.
 *
 * @returns certificacion_id → ids de medición. Vacío si falta la tabla.
 */
async function cargarMedicionesCertificadas(
  supabase: SupabaseServer,
  certificacionIds: string[],
): Promise<Map<string, Set<string>>> {
  const porCertificacion = new Map<string, Set<string>>();
  if (certificacionIds.length === 0 || faltaTablaMediciones) {
    return porCertificacion;
  }

  const { data, error } = await supabase
    .from("certificacion_mediciones")
    .select("certificacion_id, medicion_id")
    .in("certificacion_id", certificacionIds);

  if (error) {
    if (error.code !== "42P01") throw error;
    faltaTablaMediciones = true;
    console.warn(
      "[certificacion] Falta la tabla certificacion_mediciones: ejecutá " +
        "supabase/migrations/012_certificacion_mediciones.sql. " +
        "Sin ella no hay desvío de cómputo.",
    );
    return porCertificacion;
  }

  for (const fila of data ?? []) {
    const set = porCertificacion.get(fila.certificacion_id) ?? new Set<string>();
    set.add(fila.medicion_id);
    porCertificacion.set(fila.certificacion_id, set);
  }

  return porCertificacion;
}

/**
 * Medidas reales cargadas en cada certificación.
 *
 * Misma consulta aparte y misma degradación que arriba: sin la migración 014
 * el módulo entero sigue funcionando, solo que ninguna medición tiene medida
 * real y todo el desvío de cómputo da 0.
 *
 * `cantidad_calculada` se LEE (es GENERATED); nunca se escribe.
 *
 * @returns certificacion_id → (medicion_id → medidas reales).
 */
async function cargarMedidasReales(
  supabase: SupabaseServer,
  certificacionIds: string[],
): Promise<Map<string, Map<string, MedidaRealResuelta>>> {
  const porCertificacion = new Map<string, Map<string, MedidaRealResuelta>>();
  if (certificacionIds.length === 0 || faltaTablaMedidasReales) {
    return porCertificacion;
  }

  const { data, error } = await supabase
    .from("mediciones_reales")
    .select("certificacion_id, medicion_id, n, largo, ancho, alto, cantidad_calculada")
    .in("certificacion_id", certificacionIds);

  if (error) {
    if (error.code !== "42P01") throw error;
    faltaTablaMedidasReales = true;
    console.warn(
      "[certificacion] Falta la tabla mediciones_reales: ejecutá " +
        "supabase/migrations/014_mediciones_reales.sql. " +
        "Hasta entonces no se puede registrar el desvío de cómputo.",
    );
    return porCertificacion;
  }

  for (const fila of data ?? []) {
    const mapa =
      porCertificacion.get(fila.certificacion_id) ??
      new Map<string, MedidaRealResuelta>();
    mapa.set(fila.medicion_id, {
      medicion_id: fila.medicion_id,
      n: aNumeroONulo(fila.n),
      largo: aNumeroONulo(fila.largo),
      ancho: aNumeroONulo(fila.ancho),
      alto: aNumeroONulo(fila.alto),
      cantidad_calculada: aNumeroONulo(fila.cantidad_calculada),
    });
    porCertificacion.set(fila.certificacion_id, mapa);
  }

  return porCertificacion;
}

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

  // Las mediciones ejecutadas y sus medidas reales, también en una consulta
  // para todas las certificaciones a la vez.
  const certificacionIds = certificaciones.map((cert) => cert.id);
  const medicionesPorCert = await cargarMedicionesCertificadas(
    supabase,
    certificacionIds,
  );
  const medidasRealesPorCert = await cargarMedidasReales(
    supabase,
    certificacionIds,
  );

  const itemsPorObra = new Map<string, Map<string, ItemParaPrevisto>>();
  const overridesPorObra = new Map<string, Map<string, OverrideCompra>>();
  for (const [obraId, ids] of itemIdsPorObra) {
    itemsPorObra.set(
      obraId,
      await cargarItemsParaPrevisto(supabase, obraId, Array.from(ids)),
    );
    // Mismo factor que usa la explosión: override de la obra sobre referencia.
    overridesPorObra.set(
      obraId,
      await cargarOverridesCompra(supabase, obraId, "certificacion"),
    );
  }

  return certificaciones.map((cert) => {
    const itemsPorId =
      itemsPorObra.get(cert.obra_id) ?? new Map<string, ItemParaPrevisto>();
    const overrides =
      overridesPorObra.get(cert.obra_id) ?? new Map<string, OverrideCompra>();

    // `certificacion_mediciones` guarda las mediciones sueltas, sin decir de
    // qué ítem son: se reparten cruzándolas contra las mediciones de cada ítem.
    const certificadas = medicionesPorCert.get(cert.id) ?? new Set<string>();

    const pedidos: CertificacionItemEjecutado[] = cert.items.map((it) => ({
      item_id: it.item_id,
      // null = ítem completo.
      cantidad_ejecutada: it.cantidad_ejecutada ?? undefined,
      medicion_ids: (itemsPorId.get(it.item_id)?.mediciones ?? [])
        .map((m) => m.id)
        .filter((id) => certificadas.has(id)),
    }));

    // Desvío de CÓMPUTO primero: su ajuste por ítem entra en el previsto de
    // material, porque una pared que salió más grande lleva más ladrillos.
    const { desvio: desvioComputo, ajustesPorItem } = calcularDesvioComputo(
      pedidos,
      itemsPorId,
      medidasRealesPorCert.get(cert.id) ?? new Map(),
    );

    // Acá los faltantes se ignoran a propósito: al leer lo ya guardado, un
    // ítem que no resuelve no es culpa de quien consulta. Al guardar sí es
    // error, y eso lo valida el route handler.
    const previsto = calcularPrevistoConItems(
      pedidos,
      itemsPorId,
      overrides,
      ajustesPorItem,
    );

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
      overrides,
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
      desvio_computo: desvioComputo,
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
 * @param medidasReales Filas ya resueltas por `resolverMedidasReales`. Nunca
 *   traen `cantidad_calculada`: esa columna es GENERATED y la calcula la base.
 * @returns El mensaje de error si algo falló, o null si salió todo bien.
 */
export async function insertarHijosCertificacion(
  supabase: SupabaseServer,
  certificacionId: string,
  items: CertificacionItemEjecutado[],
  insumos: Array<{ insumo_id: string; cantidad_real: number }>,
  medidasReales: FilaMedicionReal[] = [],
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

  // Qué mediciones se ejecutaron. No entra en el cálculo del desvío (para eso
  // está cantidad_ejecutada): sirve para no volver a ofrecer una pared ya
  // certificada.
  const filasMediciones = items.flatMap((item) =>
    (item.medicion_ids ?? []).map((medicion_id) => ({
      certificacion_id: certificacionId,
      medicion_id,
    })),
  );

  if (filasMediciones.length > 0 && !faltaTablaMediciones) {
    const { error: errorMediciones } = await supabase
      .from("certificacion_mediciones")
      .insert(filasMediciones);

    // 42P01 = falta correr la migración 012. La certificación se guarda igual
    // (el desvío no depende de esto); lo único que se pierde es el marcado de
    // mediciones ya certificadas.
    if (errorMediciones) {
      if (errorMediciones.code !== "42P01") return errorMediciones.message;
      faltaTablaMediciones = true;
      console.warn(
        "[certificacion] Falta la tabla certificacion_mediciones: ejecutá " +
          "supabase/migrations/012_certificacion_mediciones.sql. " +
          "Las certificaciones se guardan, pero no marcan las mediciones ya ejecutadas.",
      );
    }
  }

  // Medidas reales. Solo las mediciones que el encargado corrigió: las que
  // salieron como se midieron no generan fila.
  if (medidasReales.length > 0 && !faltaTablaMedidasReales) {
    const { error: errorMedidas } = await supabase
      .from("mediciones_reales")
      .insert(
        medidasReales.map((fila) => ({
          certificacion_id: certificacionId,
          medicion_id: fila.medicion_id,
          n: fila.n,
          largo: fila.largo,
          ancho: fila.ancho,
          alto: fila.alto,
          // cantidad_calculada NO va: es GENERATED ALWAYS.
        })),
      );

    // 42P01 = falta correr la migración 014. Misma degradación que arriba: la
    // certificación se guarda igual y lo único que se pierde es el desvío de
    // cómputo, que no se persiste de todos modos.
    if (errorMedidas) {
      if (errorMedidas.code !== "42P01") return errorMedidas.message;
      faltaTablaMedidasReales = true;
      console.warn(
        "[certificacion] Falta la tabla mediciones_reales: ejecutá " +
          "supabase/migrations/014_mediciones_reales.sql. " +
          "Las certificaciones se guardan, pero las medidas reales se descartan.",
      );
    }
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
