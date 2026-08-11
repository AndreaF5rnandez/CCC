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

export interface ExplosionInsumo extends CompraResuelta {
  insumo_id: string;
  nombre: string;
  unidad_medida: string;
  tipo: Insumo["tipo"];
  precio_unitario: number;
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