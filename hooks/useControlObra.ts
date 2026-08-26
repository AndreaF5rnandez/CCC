'use client';

import { useCallback, useEffect, useState } from 'react';
import type { ControlObraResponse } from '@/types';

/**
 * Control de obra: los tres desvíos en plata y el avance contra el plan.
 * GET /api/control/[obraId]. Solo lectura — no hay nada que guardar acá.
 *
 * El período viaja al backend en vez de filtrarse en la vista: el recorte tiene
 * que entrar al cálculo (una cascada sobre tres meses no es la de la obra
 * entera recortada), así que cambiarlo vuelve a pedir.
 */
export function useControlObra(obraId: string, rango?: { desde: number; hasta: number } | null) {
  const desde = rango?.desde ?? null;
  const hasta = rango?.hasta ?? null;

  const [datos, setDatos] = useState<ControlObraResponse | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const pedir = useCallback(async (): Promise<ControlObraResponse> => {
    const query = new URLSearchParams();
    if (desde !== null) query.set('desde', String(desde));
    if (hasta !== null) query.set('hasta', String(hasta));
    const sufijo = query.toString() === '' ? '' : `?${query}`;

    const res = await fetch(`/api/control/${obraId}${sufijo}`);
    const json: unknown = await res.json();
    if (!res.ok) {
      throw new Error(
        (json as { error?: string }).error ?? 'Error al cargar el control de obra',
      );
    }
    return json as ControlObraResponse;
  }, [obraId, desde, hasta]);

  useEffect(() => {
    let activo = true;
    setCargando(true);
    setError(null);

    pedir()
      .then((datos) => {
        if (activo) setDatos(datos);
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
  }, [pedir]);

  const recargar = useCallback(async () => {
    setError(null);
    try {
      setDatos(await pedir());
    } catch (err) {
      setError((err as Error).message);
    }
  }, [pedir]);

  return { datos, cargando, error, recargar };
}

export default useControlObra;
