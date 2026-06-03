export interface Insumo {
  id: string;
  nombre: string;
  unidad: string;
  tipo: "material" | "mano_de_obra" | "equipo";
  precio: number;
  created_at: string;
  updated_at: string;
}

export interface Receta {
  id: string;
  nombre: string;
  unidad: string;
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
  estado: "activa" | "pausada" | "finalizada";
  created_at: string;
  updated_at: string;
}

export interface Medicion {
  id: string;
  obra_id: string;
  receta_id: string;
  descripcion: string;
  dim1?: number;
  dim2?: number;
  dim3?: number;
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

export interface MedicionConReceta extends Medicion {
  receta: Receta;
}

export interface PresupuestoLinea {
  receta_id: string;
  receta_nombre: string;
  unidad: string;
  cantidad_total: number;
  precio_unitario: number;
  subtotal: number;
}
