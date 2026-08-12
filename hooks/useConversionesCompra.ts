'use client';

import { useEffect, useState } from 'react';
import type { InsumoCompraObraResponse } from '@/types';

/**
 * Conversión a unidad de compra ya resuelta para los insumos de una obra,
 * indexada por insumo_id.
 *
 * GET /api/insumo-compra-obra?obra_id=. La precedencia override/referencia la
 * resuelve el backend: acá solo se consume.
 *
 * Hace falta para los materiales que el encargado agrega a mano en la
 * certificación: como no salen de ninguna receta, no vienen con la conversión
 * en la respuesta del previsto.
 */
export function useConversionesCompra(obraId: string) {
  const [conversiones, setConversiones] = useState<
    Map<string, InsumoCompraObraResponse>
  >(new Map());
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let activo = true;
    setCargando(true);
    setError(null);

    fetch(`/api/insumo-compra-obra?obra_id=${obraId}`)
      .then(async (res) => {
        const json: unknown = await res.json();
        if (!res.ok) {
          throw new Error(
            (json as { error?: string }).error ?? 'Error al cargar las unidades de compra',
          );
        }
        if (!activo) return;
        const lista = json as InsumoCompraObraResponse[];
        setConversiones(new Map(lista.map((c) => [c.insumo_id, c])));
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
  }, [obraId]);

  return { conversiones, cargando, error };
}

export default useConversionesCompra;
