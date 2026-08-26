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
  /** Qué mediciones del ítem se ejecutaron (tabla `certificacion_mediciones`).
   *  El previsto trabaja con `cantidad_ejecutada`, que ya viene sumada; esta
   *  lista dice CUÁLES paredes son, y es la que habilita cargar medidas reales. */
  medicion_ids?: string[];
  /** Medidas con las que salieron DE VERDAD algunas de esas mediciones.
   *  Opcional y parcial: solo las que difieren del cómputo. Cada `medicion_id`
   *  tiene que estar en `medicion_ids` — no se aceptan medidas reales de una
   *  medición que no se certificó. */
  medidas_reales?: MedidaRealEntrada[];
}

/** Medidas reales de UNA medición, tal como las manda el frontend.
 *
 *  Las dimensiones son parciales a propósito:
 *  - campo ausente (`undefined`) → se hereda la del cómputo original;
 *  - campo en `null` → se borra (queda NULL en la base, y COALESCE la toma
 *    como 1, igual que en `mediciones`).
 *
 *  Sin esta herencia, corregir solo el largo dejaría el ancho y el alto en
 *  NULL y la cantidad real saldría mal. */
export interface MedidaRealEntrada {
  medicion_id: string;
  n?: number | null;
  largo?: number | null;
  ancho?: number | null;
  alto?: number | null;
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
  // La que se usó para calcular el previsto de material. Es
  // cantidad_planificada + ajuste_medidas_reales.
  cantidad_ejecutada: number;
  /** Lo ejecutado SEGÚN EL CÓMPUTO: la cantidad informada en el body, o el
   *  ítem completo si no vino ninguna. Es la que se guarda en
   *  `certificacion_items.cantidad_ejecutada`; el ajuste por medidas reales no
   *  se persiste, se recalcula al leer. */
  cantidad_planificada: number;
  /** Cuánto corrieron las medidas reales a la cantidad de este ítem
   *  (Σ real − planificada sobre sus mediciones con medida real cargada).
   *  0 = no hay medidas reales, o se compensaron entre sí. */
  ajuste_medidas_reales: number;
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
  /** Desvío de cómputo de las medidas reales que vinieron en el body, para
   *  previsualizarlo antes de guardar. Vacío si no se mandó ninguna. */
  desvio_computo: CertificacionDesvioComputo;
}

/* ─── Certificación: desvío de CÓMPUTO (planificado vs medida real) ────────── */

/** Un juego de dimensiones y la cantidad que sale de ellas.
 *  `cantidad` = n × COALESCE(largo,1) × COALESCE(ancho,1) × COALESCE(alto,1),
 *  la misma fórmula de la columna generada en `mediciones`. */
export interface MedidasComputo {
  n: number;
  largo: number | null;
  ancho: number | null;
  alto: number | null;
  cantidad: number;
}

/** Desvío de cómputo de UNA medición ejecutada: cómo se midió contra cómo
 *  salió. No se guarda — se calcula al leer, cruzando
 *  `mediciones.cantidad_calculada` contra `mediciones_reales.cantidad_calculada`.
 *
 *  Sin medida real cargada, `real` es null y la cantidad real se asume igual a
 *  la planificada: el desvío da 0, que es justamente "salió como se midió". */
export interface CertificacionMedicionDesvio {
  medicion_id: string;
  item_id: string;
  rubro_id: string;
  rubro_nombre: string;
  // Descripción de la medición en el cómputo ("Pared 5").
  descripcion: string;
  // Unidad del ítem al que pertenece (m2, m3, u...).
  unidad_medida: string;
  planificada: MedidasComputo;
  // null = el encargado no corrigió esta medición.
  real: MedidasComputo | null;
  cantidad_planificada: number;
  // Igual a la planificada cuando no hay medida real cargada.
  cantidad_real: number;
  // real − planificada. Positivo = salió más grande de lo medido.
  desvio_cantidad: number;
  // null = la planificada es 0 y el porcentaje no es calculable.
  desvio_pct: number | null;
}

/** Desvío de cómputo consolidado por ítem. Sumar acá es legítimo: todas las
 *  mediciones de un ítem comparten unidad. Solo cuenta las mediciones
 *  ejecutadas en ESTA certificación, no el ítem entero. */
export interface CertificacionDesvioComputoItem {
  item_id: string;
  descripcion: string;
  unidad_medida: string;
  rubro_id: string;
  rubro_nombre: string;
  // Mediciones ejecutadas en esta certificación / cuántas tienen medida real.
  mediciones: number;
  mediciones_con_medida_real: number;
  cantidad_planificada: number;
  cantidad_real: number;
  desvio_cantidad: number;
  desvio_pct: number | null;
}

/** Agrupación por rubro. A propósito NO trae un total de cantidad: un rubro
 *  mezcla ítems en m2, m3 y u, y sumarlos daría un número sin significado
 *  físico. La consolidación en plata es tarea de la vista consolidada. */
export interface CertificacionDesvioComputoRubro {
  rubro_id: string;
  rubro_nombre: string;
  items: CertificacionDesvioComputoItem[];
  // Ítems con desvío distinto de cero, para ordenar y resumir en la vista.
  items_con_desvio: number;
}

/** Desvío de cómputo completo de una certificación, en sus tres niveles. */
export interface CertificacionDesvioComputo {
  mediciones: CertificacionMedicionDesvio[];
  items: CertificacionDesvioComputoItem[];
  rubros: CertificacionDesvioComputoRubro[];
  // Cuántas mediciones ejecutadas tienen medida real cargada.
  mediciones_con_medida_real: number;
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
  /** Desvío de CÓMPUTO: qué se midió contra qué salió, por medición, por ítem
   *  y agrupado por rubro. Independiente del desvío de material, pero no
   *  aislado: cuando una medición tiene medida real, el previsto de material
   *  de su ítem se calcula sobre la cantidad REAL (ver `insumos_previstos`). */
  desvio_computo: CertificacionDesvioComputo;
}

/** Body de POST /api/certificaciones y de PUT /api/certificaciones/[id].
 *  En el PUT los hijos se reemplazan enteros, igual que los ingredientes de
 *  una receta: lo que no venga en las listas se borra. */
export interface CertificacionRequest {
  obra_id: string;
  fecha: string;
  descripcion?: string | null;
  // Acepta ids sueltos o el objeto con la cantidad parcial ejecutada, las
  // mediciones ejecutadas y, opcionalmente, sus medidas reales.
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
/* ─── Control de obra: los tres desvíos en plata ───────────────────────────── */

/** Un mes de la obra con las tres curvas: lo que se planificó hacer, lo que se
 *  certificó y lo que salió de caja. Los acumulados vienen calculados para que
 *  la curva no los recalcule. */
export interface ControlMes {
  mes: number;
  // "Ago 2026" con fecha de inicio cargada; "Mes 3" si no hay.
  etiqueta: string;
  plan: number;
  certificado: number;
  gastado: number;
  plan_acum: number;
  certificado_acum: number;
  gastado_acum: number;
  // El mes en el que estamos hoy, para marcar el corte en la curva.
  es_actual: boolean;
  // Si el mes entra en el período que se está mirando. La curva dibuja la obra
  // entera igual: el período se sombrea, no recorta el eje.
  en_rango: boolean;
}

/** El período que se está mirando, en meses de obra. Todo lo que la pantalla
 *  muestra —tiles, cascada y tablas— está calculado sobre este recorte; la
 *  curva es la única que muestra siempre la obra completa. */
export interface ControlRango {
  desde: number;
  hasta: number;
  /** Cómo lo eligió el usuario, para que la pantalla lo diga en palabras. */
  etiqueta: string;
}

/**
 * La cascada: cómo se llega del presupuesto de lo certificado al costo real.
 *
 *   base_material + desvío de cómputo + desvío de material + desvío de precio
 *   = costo_real
 *
 * Cierra exacta y sin doble conteo porque el previsto de material ya se calcula
 * sobre la cantidad REAL de cada medición: el crecimiento de la pared se cobra
 * una sola vez, en el escalón de cómputo, y el de material mide solo rendimiento.
 *
 * Corre SOLO sobre materiales: es lo único de lo que hay consumo real cargado.
 */
export interface ControlCascada {
  // Material presupuestado para las cantidades del cómputo.
  base_material: number;
  // Las mediciones salieron distintas: más (o menos) material a precio de lista.
  desvio_computo: number;
  // Se consumió más (o menos) de lo que la receta pedía para esa cantidad real.
  desvio_material: number;
  // Se pagó distinto a lo presupuestado, valorizado sobre lo CONSUMIDO.
  desvio_precio: number;
  // Lo que costaron de verdad los materiales consumidos.
  costo_real: number;
  // costo_real − base_material, y su porcentaje sobre la base.
  desvio_total: number;
  desvio_total_pct: number | null;
}

/** Desvío de cómputo por rubro, en plata. En m² y m³ los rubros no se pueden
 *  sumar; en pesos sí, y por eso este corte existe solo acá. */
export interface ControlRubro {
  rubro_id: string;
  rubro_nombre: string;
  // Lo certificado del rubro a precio de lista completo (los tres tipos).
  certificado_monto: number;
  // Lo que corrió el alcance por medidas reales, valorizado en material.
  desvio_computo_monto: number;
  desvio_computo_pct: number | null;
  items_certificados: number;
}

/** Un material con sus dos desvíos en plata: el de consumo y el de precio. */
export interface ControlMaterial extends InsumoConsumoBase, CompraResuelta {
  // Todo en unidad BASE, como se guarda.
  previsto: number;
  consumido: number;
  desvio_material_monto: number;
  // Precio realmente pagado por unidad base (promedio ponderado de las compras).
  // null = no hay ninguna compra registrada de este insumo.
  precio_real: number | null;
  desvio_precio_monto: number;
  // Compras de la obra, en unidad de compra y en plata.
  comprado_cantidad: number;
  comprado_monto: number;
}

/** Respuesta de GET /api/control/[obraId]: todo lo que muestra la pestaña de
 *  Control, calculado en una sola pasada para que las cuatro piezas de la
 *  pantalla no puedan contar cosas distintas. */
export interface ControlObraResponse {
  obra_id: string;
  obra_nombre: string;
  fecha_inicio: string | null;
  plazo_meses: number | null;
  // Costo-costo de la obra entera, los tres tipos de insumo.
  total_presupuesto: number;
  // En qué mes de la obra estamos hoy. null si no hay fecha de inicio cargada.
  mes_actual: number | null;
  meses_totales: number;
  // null cuando la obra no tiene fecha de inicio: sin ella no hay meses y se
  // muestra todo junto.
  rango: ControlRango | null;
  avance: {
    // Acumulado hasta el mes actual, según la planificación mensual.
    plan_monto: number;
    plan_pct: number;
    // Lo certificado hasta hoy, medido contra el CÓMPUTO (así se compara con
    // el plan, que está escrito como % del cómputo).
    certificado_monto: number;
    certificado_pct: number;
    // Aparte: cuánto creció la obra respecto de lo computado. No infla el
    // avance, se informa al lado.
    crecimiento_alcance_monto: number;
    // Lo que suma el plan de TODA la obra (no solo el período). Si es menor que
    // total_presupuesto, hay ítems sin porcentajes cargados.
    plan_total_obra: number;
  };
  cascada: ControlCascada;
  // Mano de obra y equipo certificados. Se informan, pero no hay consumo real
  // cargado para ellos: todavía no se controlan.
  mano_obra_certificada: number;
  caja: {
    // Plata que salió por compras.
    comprado: number;
    // Costo de lo consumido, a precio real.
    consumido: number;
    // comprado − consumido. Positivo = material en el obrador sin usar.
    diferencia: number;
  };
  meses: ControlMes[];
  rubros: ControlRubro[];
  materiales: ControlMaterial[];
  /** Lo que la pantalla tiene que aclarar: falta la fecha de inicio, hay
   *  material consumido sin compra registrada, etc. */
  avisos: string[];
}
