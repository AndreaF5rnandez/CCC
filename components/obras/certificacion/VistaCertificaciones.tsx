'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import {
  ACENTO,
  ACENTO_TEXTO,
  GLASS_CARD,
  TEXTO,
  TEXTO_2,
  TEXTO_3,
} from '@/components/ui/estiloPragma';
import type { useCertificaciones } from '@/hooks/useCertificaciones';
import { AvisoError, AvisoExito } from './severidad';
import { FormularioCertificacion } from './FormularioCertificacion';
import { TarjetaCertificacion } from './TarjetaCertificacion';
import type { CertificacionItemsResponse, InsumoCompraObraResponse } from '@/types';

type CertificacionesHook = ReturnType<typeof useCertificaciones>;

/* Registrar e Histórico eran dos solapas separadas: se cargaba en una y se
 * miraba en la otra, y para corregir algo había que empezar de cero. Acá son
 * una sola vista — el botón abre el formulario, la lista muestra lo hecho, y
 * cada certificación se abre para ver sus desvíos o se edita en el mismo
 * formulario con todo precargado. */

/** Qué está abierto arriba de la lista. */
type Modo = { tipo: 'cerrado' } | { tipo: 'nueva' } | { tipo: 'editar'; id: string };

export function VistaCertificaciones({
  datos,
  certificaciones,
  conversiones,
  recargarItems,
}: {
  datos: CertificacionItemsResponse;
  certificaciones: CertificacionesHook;
  conversiones: Map<string, InsumoCompraObraResponse>;
  recargarItems: () => Promise<void>;
}) {
  const [modo, setModo] = useState<Modo>({ tipo: 'cerrado' });
  const [mensaje, setMensaje] = useState<string | null>(null);
  const tope = useRef<HTMLDivElement>(null);

  const { lista, cargando, error } = certificaciones;

  // Más reciente primero: el endpoint las manda en orden cronológico y acá
  // interesa lo último ejecutado.
  const ordenadas = useMemo(() => lista.slice().reverse(), [lista]);

  /* Se toma de la lista, no de una copia congelada al abrir: así el formulario
   * siempre edita el estado más nuevo de esa certificación. */
  const enEdicion = useMemo(
    () => (modo.tipo === 'editar' ? lista.find((c) => c.id === modo.id) ?? null : null),
    [modo, lista],
  );

  const abrirNueva = useCallback(() => {
    setMensaje(null);
    setModo({ tipo: 'nueva' });
    tope.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  const abrirEdicion = useCallback((id: string) => {
    setMensaje(null);
    setModo({ tipo: 'editar', id });
    tope.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  const cerrar = useCallback(() => setModo({ tipo: 'cerrado' }), []);

  const alGuardar = useCallback((texto: string) => {
    setModo({ tipo: 'cerrado' });
    setMensaje(texto);
  }, []);

  const eliminar = useCallback(
    async (id: string) => {
      await certificaciones.eliminarCertificacion(id);
      // Si se borró la que estaba abierta en el formulario, no queda nada que
      // editar: se cierra en vez de dejar un formulario huérfano.
      setModo((prev) => (prev.tipo === 'editar' && prev.id === id ? { tipo: 'cerrado' } : prev));
      setMensaje('Certificación eliminada.');
      // Las mediciones que tenía vuelven a estar disponibles para certificar.
      await recargarItems();
    },
    [certificaciones, recargarItems],
  );

  const formularioAbierto = modo.tipo !== 'cerrado';

  return (
    <div className="flex flex-col gap-4" ref={tope}>
      {/* ── Barra de acción ── */}
      <div className="flex items-center justify-between gap-3 px-1">
        <div>
          <h2 className="text-xl font-bold" style={{ color: TEXTO }}>
            Certificaciones
          </h2>
          <p className="text-sm" style={{ color: TEXTO_2 }}>
            Lo ejecutado en obra, con su desvío de material y de cómputo.
          </p>
        </div>
        {!formularioAbierto && (
          <button
            onClick={abrirNueva}
            className="text-sm font-semibold transition-colors shrink-0"
            style={{
              padding: '10px 24px',
              background: ACENTO,
              border: 'none',
              borderRadius: '9999px',
              color: ACENTO_TEXTO,
            }}
          >
            Nueva certificación +
          </button>
        )}
      </div>

      {mensaje && <AvisoExito mensaje={mensaje} />}

      {/* ── Formulario (nueva o edición) ── */}
      {modo.tipo === 'nueva' && (
        <FormularioCertificacion
          key="nueva"
          datos={datos}
          certificacion={null}
          conversiones={conversiones}
          calcularPrevisto={certificaciones.calcularPrevisto}
          crearCertificacion={certificaciones.crearCertificacion}
          actualizarCertificacion={certificaciones.actualizarCertificacion}
          recargarItems={recargarItems}
          onCancelar={cerrar}
          onGuardado={alGuardar}
        />
      )}

      {modo.tipo === 'editar' && enEdicion && (
        <FormularioCertificacion
          // La key fuerza a rearmar el estado inicial al cambiar de
          // certificación: si no, editar una segunda mostraría la primera.
          key={enEdicion.id}
          datos={datos}
          certificacion={enEdicion}
          conversiones={conversiones}
          calcularPrevisto={certificaciones.calcularPrevisto}
          crearCertificacion={certificaciones.crearCertificacion}
          actualizarCertificacion={certificaciones.actualizarCertificacion}
          recargarItems={recargarItems}
          onCancelar={cerrar}
          onGuardado={alGuardar}
        />
      )}

      {/* ── Lista ── */}
      {cargando && (
        <div className="flex items-center justify-center h-32">
          <p style={{ color: TEXTO_2 }}>Cargando certificaciones…</p>
        </div>
      )}

      {error && <AvisoError mensaje={error} />}

      {!cargando && !error && ordenadas.length === 0 && (
        <section style={GLASS_CARD} className="p-8 text-center">
          <p className="text-sm" style={{ color: TEXTO_2 }}>
            Todavía no registraste certificaciones en esta obra.
          </p>
          <p className="text-sm mt-1" style={{ color: TEXTO_3 }}>
            {formularioAbierto
              ? 'Completá el formulario de arriba y guardá la primera.'
              : 'Empezá con “Nueva certificación”: tildás las mediciones que se ejecutaron y cargás el material que se usó.'}
          </p>
        </section>
      )}

      {ordenadas.length > 0 && (
        <div className="flex flex-col gap-3">
          {ordenadas.map((cert) => (
            <TarjetaCertificacion
              key={cert.id}
              certificacion={cert}
              editando={modo.tipo === 'editar' && modo.id === cert.id}
              onEditar={() => abrirEdicion(cert.id)}
              onEliminar={eliminar}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default VistaCertificaciones;
