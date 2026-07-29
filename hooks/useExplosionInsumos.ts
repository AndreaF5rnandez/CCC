'use client';

import { useEffect, useState } from 'react';
import type { ExplosionInsumosResponse } from '@/types';

/**
 * Trae la explosión de insumos de una obra (solo lectura).
 * GET /api/explosion-insumos/[obraId]. Mismo patrón que usePlanificacion.
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

  return { datos, cargando, error };
}

export default useExplosionInsumos;
