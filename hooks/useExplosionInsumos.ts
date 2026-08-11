'use client';

import { useCallback, useEffect, useState } from 'react';
import type { ExplosionInsumosResponse, InsumoCompraObraResponse } from '@/types';

/**
 * Trae la explosión de insumos de una obra.
 * GET /api/explosion-insumos/[obraId]. Mismo patrón que usePlanificacion.
 *
 * Expone además `guardarFactorCompra`, que persiste el override del factor de
 * compra para ESTA obra (POST /api/insumo-compra-obra). Pasar `null` como
 * factor borra el override y vuelve a la referencia del insumo.
 */
export function useExplosionInsumos(obraId: string) {
  const [datos, setDatos] = useState<ExplosionInsumosResponse | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let activo = true;
    setCargando(true);
    setError(null);

    fetch(`/api/explosion-insumos/${obraId}`)
      .then(async (res) => {
        const json: unknown = await res.json();
        if (!res.ok) {
          throw new Error(
            (json as { error: string }).error ?? 'Error al cargar la explosión de insumos',
          );
        }
        if (activo) setDatos(json as ExplosionInsumosResponse);
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

  const guardarFactorCompra = useCallback(
    async (insumo_id: string, factor_compra: number | null): Promise<void> => {
      const res = await fetch('/api/insumo-compra-obra', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ obra_id: obraId, insumo_id, factor_compra }),
      });
      const json: unknown = await res.json();
      if (!res.ok) {
        throw new Error(
          (json as { error: string }).error ?? 'Error al guardar el factor de compra',
        );
      }

      // El servidor devuelve la conversión ya resuelta: se parchea solo ese
      // insumo. No hace falta recargar la explosión entera porque el factor no
      // cambia ninguna cantidad calculada, solo cómo se presenta.
      const resuelta = json as InsumoCompraObraResponse;
      setDatos((prev) =>
        prev
          ? {
              ...prev,
              insumos: prev.insumos.map((ins) =>
                ins.insumo_id === resuelta.insumo_id
                  ? {
                      ...ins,
                      unidad_compra: resuelta.unidad_compra,
                      factor_compra: resuelta.factor_compra,
                      factor_origen: resuelta.factor_origen,
                      factor_referencia: resuelta.factor_referencia,
                    }
                  : ins,
              ),
            }
          : prev,
      );
    },
    [obraId],
  );

  return { datos, cargando, error, guardarFactorCompra };
}

export default useExplosionInsumos;
