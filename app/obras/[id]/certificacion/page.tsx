'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { ObraTabs } from '@/components/obras/ObraTabs';
import { VistaCompras } from '@/components/obras/VistaCompras';
import { VistaCertificaciones } from '@/components/obras/certificacion/VistaCertificaciones';
import { AvisoError } from '@/components/obras/certificacion/severidad';
import { MESH_GRADIENT, TEXTO, TEXTO_2 } from '@/components/ui/estiloPragma';
import { useCertificacionItems } from '@/hooks/useCertificacionItems';
import { useCertificaciones } from '@/hooks/useCertificaciones';
import { useConversionesCompra } from '@/hooks/useConversionesCompra';

/* Antes había tres sub-solapas: Registrar, Histórico y Compras. Cargar y ver
 * eran dos lugares distintos, así que corregir algo obligaba a mirar en una y
 * volver a tildar todo en la otra. Ahora "Certificaciones" es una sola vista:
 * el botón abre el formulario, la lista muestra lo hecho y cada certificación
 * se edita en el mismo formulario, precargado. */

type SubTabId = 'certificaciones' | 'compras';

const SUBTABS: { id: SubTabId; label: string }[] = [
  { id: 'certificaciones', label: 'Certificaciones' },
  { id: 'compras', label: 'Compras y precios' },
];

export default function CertificacionPage() {
  const params = useParams();
  const obraId = params.id as string;

  /* La lista de ítems por rubro con su cantidad total ya la arma el endpoint de
   * certificación-items, con exactamente la forma que necesita el checklist (y
   * de ahí sale también el nombre de la obra). */
  const { datos, cargando, error, recargar: recargarItems } = useCertificacionItems(obraId);

  /* El hook de certificaciones vive acá y no dentro de la vista: sobrevive al
   * cambio de sub-solapa, así que volver de Compras no vuelve a pedir todo. */
  const certificaciones = useCertificaciones(obraId);

  /* Conversiones a unidad de compra de la obra. Las necesita el formulario para
   * los materiales agregados a mano; los previstos ya vienen con la suya. */
  const { conversiones } = useConversionesCompra(obraId);

  const [subtab, setSubtab] = useState<SubTabId>('certificaciones');

  return (
    <div
      className="flex flex-col h-screen overflow-hidden"
      style={{ backgroundColor: '#D5D4DC', background: MESH_GRADIENT }}
    >
      <ObraTabs obraId={obraId} activa="certificacion" obraNombre={datos?.obra_nombre ?? '…'} />

      <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-4">
        {cargando && (
          <div className="flex items-center justify-center h-64">
            <p style={{ color: TEXTO_2 }}>Cargando certificación…</p>
          </div>
        )}

        {error && <AvisoError mensaje={error} />}

        {datos && !error && (
          <>
            {/* Sub-pestañas internas — mismo patrón que Planificación */}
            <div className="flex gap-6 px-1">
              {SUBTABS.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setSubtab(t.id)}
                  className="text-sm pb-2 transition-colors"
                  style={{
                    color: subtab === t.id ? TEXTO : TEXTO_2,
                    fontWeight: subtab === t.id ? 600 : 500,
                    borderBottom:
                      subtab === t.id ? `2px solid ${TEXTO}` : '2px solid transparent',
                  }}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {subtab === 'certificaciones' && (
              <VistaCertificaciones
                datos={datos}
                certificaciones={certificaciones}
                conversiones={conversiones}
                recargarItems={recargarItems}
              />
            )}

            {/* Compras vive en su propio módulo y trae sus propios datos: no
                comparte estado con la vista de certificaciones. */}
            {subtab === 'compras' && <VistaCompras obraId={obraId} />}
          </>
        )}
      </div>
    </div>
  );
}
