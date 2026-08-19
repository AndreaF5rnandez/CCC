'use client';

import { useCallback, useEffect, useState } from 'react';
import type {
  CertificacionConDesvio,
  CertificacionItemEjecutado,
  CertificacionPrevistoResponse,
} from '@/types';

/** Lo que la vista manda para crear una certificación. */
export interface NuevaCertificacion {
  fecha: string;
  descripcion: string | null;
  items: CertificacionItemEjecutado[];
  insumos: Array<{ insumo_id: string; cantidad_real: number }>;
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
 * Certificaciones de una obra: listado con desvío + creación, y el cálculo
 * del material previsto para una selección de ítems.
 *
 * Mismo patrón que el resto de los hooks del proyecto: expone
 * `lista, cargando, error` y las operaciones.
 */
export function useCertificaciones(obraId: string) {
  const [lista, setLista] = useState<CertificacionConDesvio[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const recargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const res = await fetch(`/api/certificaciones?obra_id=${obraId}`);
      setLista(
        await leerJson<CertificacionConDesvio[]>(res, 'Error al cargar las certificaciones'),
      );
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setCargando(false);
    }
  }, [obraId]);

  useEffect(() => {
    let activo = true;
    setCargando(true);
    setError(null);

    fetch(`/api/certificaciones?obra_id=${obraId}`)
      .then((res) =>
        leerJson<CertificacionConDesvio[]>(res, 'Error al cargar las certificaciones'),
      )
      .then((datos) => {
        if (activo) setLista(datos);
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

  /**
   * Material previsto para una selección de ítems, sin guardar nada.
   * Lo usa la vista de Registrar para mostrar el previsto mientras se tilda.
   */
  const calcularPrevisto = useCallback(
    async (
      items: CertificacionItemEjecutado[],
      signal?: AbortSignal,
    ): Promise<CertificacionPrevistoResponse> => {
      const res = await fetch('/api/certificacion-previsto', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ obra_id: obraId, items }),
        signal,
      });
      return leerJson<CertificacionPrevistoResponse>(
        res,
        'Error al calcular el material previsto',
      );
    },
    [obraId],
  );

  const crearCertificacion = useCallback(
    async (datos: NuevaCertificacion): Promise<CertificacionConDesvio> => {
      const res = await fetch('/api/certificaciones', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ obra_id: obraId, ...datos }),
      });
      const creada = await leerJson<CertificacionConDesvio>(
        res,
        'Error al guardar la certificación',
      );
      setLista((prev) => [...prev, creada]);
      return creada;
    },
    [obraId],
  );

  /**
   * Edita una certificación existente. El PUT reemplaza los hijos enteros
   * (ítems, mediciones ejecutadas, medidas reales y material), así que la vista
   * manda siempre el estado completo, no un parche.
   */
  const actualizarCertificacion = useCallback(
    async (id: string, datos: NuevaCertificacion): Promise<CertificacionConDesvio> => {
      const res = await fetch(`/api/certificaciones/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(datos),
      });
      const actualizada = await leerJson<CertificacionConDesvio>(
        res,
        'Error al guardar los cambios de la certificación',
      );
      setLista((prev) => prev.map((c) => (c.id === id ? actualizada : c)));
      return actualizada;
    },
    [],
  );

  const eliminarCertificacion = useCallback(async (id: string): Promise<void> => {
    const res = await fetch(`/api/certificaciones/${id}`, { method: 'DELETE' });
    await leerJson<{ message: string }>(res, 'Error al eliminar la certificación');
    setLista((prev) => prev.filter((c) => c.id !== id));
  }, []);

  return {
    lista,
    cargando,
    error,
    recargar,
    calcularPrevisto,
    crearCertificacion,
    actualizarCertificacion,
    eliminarCertificacion,
  };
}

export default useCertificaciones;
