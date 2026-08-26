'use client';

import Link from 'next/link';

/**
 * Header de obra con las pestañas de sección.
 *
 * Vivía duplicado en Cómputo, Presupuesto y Planificación; al sumar
 * Certificación se extrajo acá para que agregar una pestaña sea un solo
 * cambio y las cuatro no se desincronicen.
 */

export type ObraTabId =
  | 'medicion'
  | 'presupuesto'
  | 'planificacion'
  | 'certificacion'
  | 'control';

/* Orden = el ciclo de vida de la obra: se computa, se presupuesta, se
 * planifica, se ejecuta y se controla. Control va última porque lee de las
 * cuatro anteriores. */
const TABS: { id: ObraTabId; label: string; href: (obraId: string) => string }[] = [
  { id: 'medicion', label: 'Cómputo', href: (id) => `/obras/${id}/medicion` },
  { id: 'presupuesto', label: 'Presupuesto', href: (id) => `/obras/${id}/presupuesto` },
  { id: 'planificacion', label: 'Planificación', href: (id) => `/obras/${id}/planificacion` },
  { id: 'certificacion', label: 'Certificación', href: (id) => `/obras/${id}/certificacion` },
  { id: 'control', label: 'Control', href: (id) => `/obras/${id}/control` },
];

export function ObraTabs({
  obraId,
  activa,
  obraNombre,
}: {
  obraId: string;
  activa: ObraTabId;
  obraNombre: string;
}) {
  return (
    <header
      className="shrink-0 z-10 px-6 flex items-stretch gap-4"
      style={{
        height: '48px',
        background: 'rgba(255, 255, 255, 0.80)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        borderBottom: '1px solid rgba(255, 255, 255, 0.50)',
      }}
    >
      <span
        className="font-semibold text-sm truncate flex-1 flex items-center"
        style={{ color: '#1A1A2E' }}
      >
        {obraNombre || '…'}
      </span>
      <nav className="flex h-full">
        {TABS.map((tab) => {
          const esActiva = tab.id === activa;
          return (
            <Link
              key={tab.id}
              href={tab.href(obraId)}
              className={
                esActiva
                  ? 'px-5 flex items-center text-sm font-semibold border-b-2'
                  : 'px-5 flex items-center text-sm font-medium border-b-2 border-transparent transition-colors'
              }
              style={
                esActiva
                  ? { borderColor: '#1A1A2E', color: '#1A1A2E' }
                  : { color: '#6B7080' }
              }
            >
              {tab.label}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}

export default ObraTabs;
