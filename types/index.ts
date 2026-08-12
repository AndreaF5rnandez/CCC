export interface Insumo {
  id: string;
  codigo?: string;
  nombre: string;
  unidad_medida: string;
  tipo: "material" | "mano_de_obra" | "equipo";
  precio_unitario: number;
  // Referencia de compra (nullable): en qué unidad se compra el insumo y
  // cuántas unidades de `unidad_medida` entran en una unidad de compra
  // (ej: 'bolsa' / 25 = 25 kg por bolsa). Es el valor por defecto compartido
  // por todas las obras; una obra puede pisarlo vía InsumoCompraObra.
  unidad_compra?: string | null;
  factor_compra?: number | null;
  created_at: string;
  updated_at: string;
}

/** Override del factor de compra para una obra puntual. Sin fila, vale la
 *  referencia del insumo; borrar la fila vuelve a la referencia. */
export interface InsumoCompraObra {
  id: string;
  obra_id: string;
  insumo_id: string;
  factor_compra: number;
  // Opcional: si es null se hereda la unidad de compra del insumo.
  unidad_compra?: string | null;
  created_at: string;
  updated_at: string;
}

export interface Receta {
  id: string;
  nombre: string;
  unidad_medida: string;
  created_at: string;
  updated_at: string;
}

export interface RecetaInsumo {
  id: string;
  receta_id: string;
  insumo_id: string;
  cantidad: number;
  created_at: string;
}

export interface Obra {
  id: string;
  nombre: string;
  cliente: string;
  direccion?: string;
  fecha_inicio?: string;
  plazo_meses?: number | null;
  estado: "activa" | "pausada" | "finalizada";
  // Porcentajes legacy (previos al Paquete Empresario). El cálculo del
  // presupuesto ya no los usa: viven en paquete_empresario. Se conservan
  // mientras la pantalla vieja se termina de migrar.
  gastos_generales_pct?: number;
  costo_financiero_pct?: number;
  beneficio_pct?: number;
  impuestos_pct?: number;
  created_at: string;
  updated_at: string;
}

export type GastoCategoria = "GGDOO" | "GGDOE" | "GGI";
export type GastoModalidad = "mensual" | "unico";

export interface GastoGeneral {
  id: string;
  obra_id: string;
  categoria: GastoCategoria;
  descripcion: string;
  modalidad: GastoModalidad;
  monto: number;
  // Solo se usa cuando modalidad === "mensual".
  meses: number | null;
  orden: number;
  created_at: string;
}

export interface PaqueteEmpresario {
  id: string;
  obra_id: string;
  costo_financiero: number;
  beneficio: number;
  iva: number;
  rentas: number;
  created_at: string;
}

export interface Rubro {
  id: string;
  obra_id: string;
  nombre: string;
  orden: number;
  created_at: string;
  updated_at: string;
}

export interface Item {
  id: string;
  rubro_id: string;
  receta_id?: string | null;
  unidad_medida: string;
  descripcion: string;
  orden: number;
  created_at: string;
  updated_at: string;
}

export interface Medicion {
  id: string;
  item_id: string;
  descripcion: string;
  n: number;
  largo?: number;
  ancho?: number;
  alto?: number;
  cantidad_calculada: number;
  created_at: string;
  updated_at: string;
}

export interface RecetaConInsumos extends Receta {
  ingredientes: Array<
    RecetaInsumo & {
      insumo: Insumo;
    }
  >;
  precio_unitario: number;
}

export interface RecetaConIngredientes extends Receta {
  ingredientes: Array<RecetaInsumo & { insumo: Insumo }>;
}

export type MedicionResumen = Pick<Medicion, 'id' | 'item_id' | 'cantidad_calculada'>;

export interface ItemConReceta extends Item {
  receta?: RecetaConIngredientes | null;
  mediciones: MedicionResumen[];
}

export interface ItemCompleto extends Item {
  receta: RecetaConInsumos;
  mediciones: Medicion[];
  cantidad_total: number;
}

export interface RubroCompleto extends Rubro {
  items: ItemCompleto[];
  subtotal: number;
}

export interface PresupuestoLinea {
  rubro_id: string;
  rubro_nombre: string;
  item_id: string;
  receta_id: string;
  receta_nombre: string;
  unidad: string;
  cantidad_total: number;
  precio_unitario: number;
  subtotal: number;
}

/* ─── Paquete Empresario: forma de respuesta de /api/presupuesto ──────────── */

export interface PresupuestoItem {
  item_id: string;
  receta_id: string;
  receta_nombre: string;
  unidad: string;
  cantidad_total: number;
  precio_unitario: number;
  subtotal: number;
}

export interface PresupuestoRubro {
  rubro_id: string;
  rubro_nombre: string;
  items: PresupuestoItem[];
  subtotal: number;
}

export interface CostoDirecto {
  rubros: PresupuestoRubro[];
  costo_costo: number;
}

export interface GastoGeneralCalculado extends GastoGeneral {
  total: number;
}

export interface GastosGeneralesResumen {
  lista: GastoGeneralCalculado[];
  total: number;
  porcentaje_derivado: number;
}

export interface CierreImpuestos {
  iva_pct: number;
  rentas_pct: number;
  monto: number;
}

export interface CierrePresupuesto {
  costo_costo: number;
  gastos_generales: number;
  subtotal_1: number;
  costo_financiero_pct: number;
  costo_financiero_monto: number;
  subtotal_2: number;
  beneficio_pct: number;
  beneficio_monto: number;
  subtotal_3: number;
  impuestos: CierreImpuestos;
  precio_final: number;
  coeficiente: number;
}

export interface PresupuestoResponse {
  obra: Obra;
  costo_directo: CostoDirecto;
  gastos_generales: GastosGeneralesResumen;
  cierre: CierrePresupuesto;
}

export interface Planificacion {
  id: string;
  item_id: string;
  mes: number;
  pct_plan: number;
  created_at: string;
  updated_at: string;
}

export interface PlanificacionItem {
  item_id: string;
  descripcion: string;
  unidad_medida: string;
  cantidad_total: number;
  subtotal_costo_costo: number;
  incidencia_pct: number;
  planificacion: Pick<Planificacion, 'mes' | 'pct_plan'>[];
}

export interface PlanificacionRubro {
  rubro_id: string;
  rubro_nombre: string;
  items: PlanificacionItem[];
}

export interface PlanificacionResponse {
  obra_id: string;
  obra_nombre: string;
  plazo_meses: number | null;
  fecha_inicio: string;
  total_costo_costo: number;
  rubros: PlanificacionRubro[];
}

/* ─── Explosión de insumos: respuesta de /api/explosion-insumos/[obraId] ────── */

/** De dónde salió el factor de compra vigente para un insumo en una obra.
 *  null = el insumo no tiene conversión definida en ningún nivel. */
export type FactorOrigen = "obra" | "referencia" | null;

/** Conversión a unidad de compra ya resuelta (override de la obra si existe,
 *  si no la referencia del insumo). Es el único dato que la vista consume:
 *  el frontend no vuelve a decidir cuál gana. */
export interface CompraResuelta {
  unidad_compra: string | null;
  factor_compra: number | null;
  factor_origen: FactorOrigen;
  // Referencia del insumo, para poder mostrar a qué valor se vuelve al borrar
  // el override. No se usa para calcular.
  factor_referencia: number | null;
}

/** Metadatos del insumo que acompañan a cualquier cantidad consumida.
 *  Compartido por la explosión mensual y el previsto de certificación. */
export interface InsumoConsumoBase {
  insumo_id: string;
  nombre: string;
  unidad_medida: string;
  tipo: Insumo["tipo"];
  precio_unitario: number;
}

export interface ExplosionInsumo extends CompraResuelta, InsumoConsumoBase {
  // Consumo del insumo por mes. Longitud = plazo_meses; índice 0 = mes 1.
  // Un mes sin consumo es 0 (nunca se omite), para poder dibujar la grilla completa.
  consumo_por_mes: number[];
  // Suma de consumo_por_mes: consumo del insumo en toda la obra.
  total: number;
}

export interface ExplosionInsumosResponse {
  obra_id: string;
  obra_nombre: string;
  plazo_meses: number | null;
  fecha_inicio: string;
  insumos: ExplosionInsumo[];
}

/** Respuesta de POST /api/insumo-compra-obra: el estado de la conversión ya
 *  resuelto después de guardar (o de borrar) el override. La vista lo aplica
 *  tal cual, sin recalcular la precedencia por su cuenta. */
export interface InsumoCompraObraResponse extends CompraResuelta {
  insumo_id: string;
}

/* ─── Certificación: material previsto ─────────────────────────────────────── */

/** Un ítem ejecutado, tal como lo manda el frontend.
 *  Sin `cantidad_ejecutada` se asume el ítem completo (suma de sus mediciones). */
export interface CertificacionItemEjecutado {
  item_id: string;
  cantidad_ejecutada?: number | null;
  /** Qué mediciones del ítem se ejecutaron. Solo se usa al guardar (tabla
   *  `certificacion_mediciones`): el cálculo del previsto trabaja con
   *  `cantidad_ejecutada`, que ya viene sumada. */
  medicion_ids?: string[];
}

/** Body de POST /api/certificacion-previsto. */
export interface CertificacionPrevistoRequest {
  obra_id: string;
  items: CertificacionItemEjecutado[];
}

/** Qué cantidad se terminó usando para cada ítem del pedido.
 *  Va en la respuesta para que la vista pueda mostrar sobre qué se calculó y
 *  para que un ítem sin receta se vea, en vez de desaparecer en silencio. */
export interface CertificacionItemPrevisto {
  item_id: string;
  descripcion: string;
  unidad_medida: string;
  // Suma de las mediciones del ítem: el 100% del cómputo.
  cantidad_total: number;
  // La que se usó para calcular el previsto.
  cantidad_ejecutada: number;
  // "informada" = vino en el body; "total" = se asumió el ítem completo.
  origen_cantidad: "informada" | "total";
  // false = el ítem no tiene receta o la receta está vacía: no aporta insumos.
  aporta_insumos: boolean;
}

/** Un insumo previsto, ya agrupado y sumado a lo largo de todos los ítems.
 *  `cantidad_prevista` va SIEMPRE en unidad base; la conversión a unidad de
 *  compra viene resuelta (override de la obra sobre referencia del insumo),
 *  igual que en la explosión, para que las dos pantallas usen el mismo factor. */
export interface CertificacionInsumoPrevisto
  extends InsumoConsumoBase,
    CompraResuelta {
  cantidad_prevista: number;
}

/** Respuesta de POST /api/certificacion-previsto.
 *  Devuelve los tres tipos de insumo etiquetados; filtrar a solo materiales
 *  es decisión de la vista, no del backend. */
export interface CertificacionPrevistoResponse {
  obra_id: string;
  items: CertificacionItemPrevisto[];
  insumos: CertificacionInsumoPrevisto[];
}

/* ─── Certificación: árbol de selección (rubro → ítem → mediciones) ────────── */

/** Una medición como la ve el selector de certificación: lo justo para que el
 *  encargado la reconozca ("Pared 5", 3,50 × 2,60). */
export type CertificacionMedicion = Pick<
  Medicion,
  'id' | 'descripcion' | 'n' | 'largo' | 'ancho' | 'alto' | 'cantidad_calculada'
>;

export interface CertificacionItemDisponible {
  item_id: string;
  descripcion: string;
  unidad_medida: string;
  // Suma de las cantidades de sus mediciones.
  cantidad_total: number;
  mediciones: CertificacionMedicion[];
}

export interface CertificacionRubroDisponible {
  rubro_id: string;
  rubro_nombre: string;
  items: CertificacionItemDisponible[];
}

/** Una medición que ya fue certificada en una certificación anterior.
 *  La fecha se muestra en la marca, para que el encargado sepa cuándo. */
export interface MedicionCertificada {
  medicion_id: string;
  certificacion_id: string;
  fecha: string;
}

/** Respuesta de GET /api/certificacion-items?obra_id=.
 *  Es el árbol que se tilda en la vista de Registrar. */
export interface CertificacionItemsResponse {
  obra_id: string;
  obra_nombre: string;
  rubros: CertificacionRubroDisponible[];
  // Mediciones ya certificadas en esta obra, para no ofrecerlas de nuevo.
  // Vacío si la migración 012 todavía no se aplicó, o si no hay nada certificado.
  certificadas: MedicionCertificada[];
}

/* ─── Certificación: registro guardado y desvío ────────────────────────────── */

/** Fila de `certificaciones`. */
export interface Certificacion {
  id: string;
  obra_id: string;
  fecha: string;
  descripcion: string | null;
  created_at: string;
  updated_at: string;
}

/** Material real consumido en una certificación, con el insumo resuelto. */
export interface CertificacionInsumoReal extends InsumoConsumoBase {
  cantidad_real: number;
}

/** De dónde salió cada fila del desvío:
 *  - "ambos": el insumo estaba previsto y se cargó consumo real.
 *  - "solo_previsto": estaba previsto y no se cargó consumo (real = 0).
 *  - "solo_real": se consumió un material que las recetas no contemplaban. */
export type DesvioOrigen = "ambos" | "solo_previsto" | "solo_real";

/** Desvío de un insumo dentro de una certificación. No se guarda: se calcula
 *  al momento cruzando el previsto de las recetas contra el real cargado.
 *
 *  Todas las cantidades van en unidad BASE del insumo. La conversión a unidad
 *  de compra viene resuelta para que la vista la muestre en bolsas/barras sin
 *  volver a decidir el factor: como es una división por una constante, el
 *  porcentaje de desvío es el mismo en las dos unidades. */
export interface CertificacionDesvioInsumo
  extends InsumoConsumoBase,
    CompraResuelta {
  cantidad_prevista: number;
  cantidad_real: number;
  // real − previsto. Positivo = se consumió de más.
  desvio_cantidad: number;
  // (real − previsto) / previsto × 100.
  // null = no calculable en porcentaje porque el previsto es 0.
  desvio_pct: number | null;
  origen: DesvioOrigen;
}

/** Una certificación con su detalle y su desvío ya calculado. */
export interface CertificacionConDesvio extends Certificacion {
  // Ítems ejecutados, con la cantidad sobre la que se calculó el previsto.
  items: CertificacionItemPrevisto[];
  // Material previsto según las recetas de esos ítems.
  insumos_previstos: CertificacionInsumoPrevisto[];
  // Material realmente consumido, tal como lo cargó el encargado.
  insumos_reales: CertificacionInsumoReal[];
  // Cruce de los dos anteriores. Incluye los tres tipos de insumo etiquetados.
  desvio: CertificacionDesvioInsumo[];
}

/** Body de POST /api/certificaciones y de PUT /api/certificaciones/[id].
 *  En el PUT los hijos se reemplazan enteros, igual que los ingredientes de
 *  una receta: lo que no venga en las listas se borra. */
export interface CertificacionRequest {
  obra_id: string;
  fecha: string;
  descripcion?: string | null;
  // Acepta ids sueltos o el objeto con la cantidad parcial ejecutada.
  items: Array<string | CertificacionItemEjecutado>;
  insumos: Array<{ insumo_id: string; cantidad_real: number }>;
}

/* ─── Registro de compras y desvío de PRECIO ───────────────────────────────── */

/** Fila de `compras`.
 *
 *  `cantidad` y `precio_unitario_compra` van en unidad de COMPRA (50 bolsas a
 *  $153,75 la bolsa), no en unidad base. Es la unidad en la que el encargado
 *  compra y en la que le llega la factura; la conversión a unidad base se hace
 *  al calcular, no al guardar. */
export interface Compra {
  id: string;
  obra_id: string;
  insumo_id: string;
  fecha: string;
  cantidad: number;
  precio_unitario_compra: number;
  proveedor: string | null;
  created_at: string;
  updated_at: string;
}

/** Desvío de precio: lo pagado contra lo presupuestado, ya llevados los dos a
 *  la MISMA unidad de compra.
 *
 *  El precio presupuestado (`insumos.precio_unitario`) está en unidad base, así
 *  que se multiplica por el factor de compra vigente en la obra:
 *
 *    precio_previsto_compra = precio_unitario × factor_compra
 *    (6,15 $/kg × 25 kg/bolsa = 153,75 $/bolsa)
 *
 *  Un insumo sin factor configurado se compra en su unidad base, así que el
 *  previsto es el precio base tal cual (factor implícito 1) y la comparación
 *  sale directa, sin conversión.
 *
 *  Nada de esto se guarda: se recalcula en cada lectura, igual que el desvío de
 *  cantidad de la certificación. */
export interface DesvioPrecio {
  // Precio presupuestado del insumo, en unidad de compra.
  precio_previsto_compra: number;
  // pagado − previsto. Positivo = se pagó de más.
  desvio_precio: number;
  // (pagado − previsto) / previsto × 100.
  // null = no calculable porque el insumo no tiene precio presupuestado.
  desvio_pct: number | null;
}

/** Una compra con el insumo resuelto, la conversión de la obra y su desvío. */
export interface CompraConDesvio extends Compra, InsumoConsumoBase, CompraResuelta, DesvioPrecio {
  // Total pagado por esta compra: cantidad × precio_unitario_compra.
  gasto: number;
}

/** Desvío de precio consolidado de un insumo a lo largo de toda la obra.
 *
 *  El precio real es el PROMEDIO PONDERADO por cantidad, no el promedio simple:
 *
 *    precio_promedio_compra = Σ(cantidad × precio) / Σ(cantidad)
 *
 *  Así una compra de 100 bolsas pesa lo que tiene que pesar frente a una de 5.
 *  El promedio simple diría otra cosa y sería la respuesta equivocada. */
export interface CompraConsolidadaInsumo
  extends InsumoConsumoBase,
    CompraResuelta,
    DesvioPrecio {
  // Cuántas compras de este insumo hay en la obra.
  cantidad_compras: number;
  // Suma de las cantidades compradas, en unidad de compra.
  cantidad_total: number;
  // Lo realmente gastado en este insumo: Σ(cantidad × precio).
  gasto_total: number;
  // Lo que habría costado esa misma cantidad al precio presupuestado.
  gasto_previsto: number;
  // gasto_total − gasto_previsto: el desvío de precio en plata.
  desvio_gasto: number;
  // Promedio ponderado de lo pagado, en unidad de compra.
  precio_promedio_compra: number;
}

/** Respuesta de GET /api/compras?obra_id=.
 *
 *  Las compras y su consolidado viajan juntos a propósito: salen de los mismos
 *  datos y del mismo factor de compra, así que calcularlos en una sola pasada
 *  garantiza que las dos tablas de la pantalla no puedan discrepar. */
export interface ComprasResponse {
  obra_id: string;
  // Orden cronológico (fecha, y dentro del día por orden de carga).
  compras: CompraConDesvio[];
  // Un renglón por insumo con compras en la obra.
  consolidado: CompraConsolidadaInsumo[];
}

/** Body de POST /api/compras y de PUT /api/compras/[id].
 *  En el PUT la obra no se puede cambiar: mover una compra de obra cambiaría el
 *  factor de conversión con el que se calculó su desvío. */
export interface CompraRequest {
  obra_id: string;
  insumo_id: string;
  fecha: string;
  cantidad: number;
  precio_unitario_compra: number;
  proveedor?: string | null;
}