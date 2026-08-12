'use client';

import { useEffect, useState } from 'react';
import type { CertificacionItemsResponse } from '@/types';

/**
 * Árbol rubro → ítem → mediciones de una obra, para el selector de Registrar.
 * GET /api/certificacion-items?obra_id=. Solo lectura.
 */
export function useCertificacionItems(obraId: string) {
  const [datos, setDatos] = useState<CertificacionItemsResponse | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let activo = true;
    setCargando(true);
    setError(null);

    fetch(`/api/certificacion-items?obra_id=${obraId}`)
      .then(async (res) => {
        const json: unknown = await res.json();
        if (!res.ok) {
          throw new Error(
            (json as { error?: string }).error ?? 'Error al cargar los ítems de la obra',
          );
        }
        if (activo) setDatos(json as CertificacionItemsResponse);
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

export default useCertificacionItems;
