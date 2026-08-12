'use client';

import { useCallback, useEffect, useState } from 'react';
import type {
  CompraConDesvio,
  CompraConsolidadaInsumo,
  ComprasResponse,
} from '@/types';

/** Lo que la vista manda para crear o editar una compra.
 *  `cantidad` y `precio_unitario_compra` van en unidad de COMPRA. */
export interface DatosCompra {
  insumo_id: string;
  fecha: string;
  cantidad: number;
  precio_unitario_compra: number;
  proveedor: string | null;
}

async function leerJson<T>(res: Response, mensajeGenerico: string): Promise<T> {
  const json: unknown = await res.json();
  if (!res.ok) {
    // El backend siempre manda { error }. El genérico es por si algo devuelve
    // otra cosa (un 500 de Next, por ejemplo) y la pantalla igual tiene que
    // mostrar algo legible en vez de "undefined".
    throw new Error((json as { error?: string }).error ?? mensajeGenerico);
  }
  return json as T;
}

/**
 * Registro de compras de una obra y su desvío de precio.
 *
 * El desvío no se guarda: lo calcula el backend en cada lectura comparando lo
 * pagado contra el precio presupuestado del insumo, ya convertido a unidad de
 * compra con el factor de la obra.
 *
 * Después de crear, editar o borrar se relee todo en vez de parchear el estado
 * local: el consolidado es un promedio ponderado sobre TODAS las compras del
 * insumo, así que tocar una fila mueve el renglón entero. Recalcularlo en el
 * cliente sería una segunda implementación de la misma cuenta, justo lo que el
 * proyecto evita en la conversión de unidades.
 *
 * Mismo patrón que el resto de los hooks: expone `cargando, error` y las
 * operaciones.
 */
export function useCompras(obraId: string) {
  const [compras, setCompras] = useState<CompraConDesvio[]>([]);
  const [consolidado, setConsolidado] = useState<CompraConsolidadaInsumo[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const traer = useCallback(async (): Promise<ComprasResponse> => {
    const res = await fetch(`/api/compras?obra_id=${obraId}`);
    return leerJson<ComprasResponse>(res, 'Error al cargar las compras');
  }, [obraId]);

  const recargar = useCallback(async () => {
    const datos = await traer();
    setCompras(datos.compras);
    setConsolidado(datos.consolidado);
  }, [traer]);

  useEffect(() => {
    let activo = true;
    setCargando(true);
    setError(null);

    traer()
      .then((datos) => {
        if (!activo) return;
        setCompras(datos.compras);
        setConsolidado(datos.consolidado);
      })
      .catch((err: Error) => {
        if (activo) setError(err.message);
      })
      .finally(() => {
        if (activo) setCargando(false);
      });

    return () => {
      activo = false;
    };
  }, [traer]);

  const crearCompra = useCallback(
    async (datos: DatosCompra): Promise<void> => {
      const res = await fetch('/api/compras', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ obra_id: obraId, ...datos }),
      });
      await leerJson<CompraConDesvio>(res, 'Error al registrar la compra');
      await recargar();
    },
    [obraId, recargar],
  );

  const actualizarCompra = useCallback(
    async (id: string, datos: DatosCompra): Promise<void> => {
      const res = await fetch(`/api/compras/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(datos),
      });
      await leerJson<CompraConDesvio>(res, 'Error al guardar los cambios');
      await recargar();
    },
    [recargar],
  );

  const eliminarCompra = useCallback(
    async (id: string): Promise<void> => {
      const res = await fetch(`/api/compras/${id}`, { method: 'DELETE' });
      await leerJson<{ message: string }>(res, 'Error al eliminar la compra');
      await recargar();
    },
    [recargar],
  );

  return {
    compras,
    consolidado,
    cargando,
    error,
    recargar,
    crearCompra,
    actualizarCompra,
    eliminarCompra,
  };
}

export default useCompras;
