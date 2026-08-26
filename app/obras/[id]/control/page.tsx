'use client';

import { useCallback, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { ObraTabs } from '@/components/obras/ObraTabs';
import { ResumenControl } from '@/components/obras/control/ResumenControl';
import { CurvaAvance } from '@/components/obras/control/CurvaAvance';
import { TablaMateriales, TablaRubros } from '@/components/obras/control/TablasControl';
import { SelectorPeriodo, type Periodo } from '@/components/obras/control/SelectorPeriodo';
import { AvisoError } from '@/components/obras/certificacion/severidad';
import {
  AMBAR,
  AMBAR_FONDO,
  GLASS_CARD,
  MESH_GRADIENT,
  TEXTO,
  TEXTO_2,
  TEXTO_3,
} from '@/components/ui/estiloPragma';
import { useControlObra } from '@/hooks/useControlObra';

/* Control de obra: la vista de dirección.
 *
 * Es la única pantalla que cruza los tres módulos —planificación, certificación
 * y compras— y la única donde los tres desvíos se pueden sumar, porque los tres
 * están en pesos. En m² y en bolsas no se pueden sumar, y por eso cada módulo
 * muestra el suyo por separado.
 *
 * No calcula nada: todo viene resuelto de GET /api/control/[obraId], en una
 * sola pasada, para que la cascada y las tablas no puedan discrepar. */

export default function ControlPage() {
  const params = useParams();
  const obraId = params.id as string;

  /* El período elegido. Arranca en null = "hasta hoy", que es lo que el backend
   * asume sin parámetros: así la primera carga no espera a saber cuántos meses
   * tiene la obra para recién ahí pedir los datos. */
  const [periodo, setPeriodo] = useState<Periodo | null>(null);
  const { datos, cargando, error } = useControlObra(obraId, periodo);

  const cambiarPeriodo = useCallback((nuevo: Periodo) => setPeriodo(nuevo), []);

  /* Las etiquetas de los meses ya vienen resueltas en la serie de la curva: se
   * reusan para los desplegables en vez de recalcular el calendario en la vista. */
  const etiquetaDeMes = useMemo(() => {
    const porMes = new Map((datos?.meses ?? []).map((m) => [m.mes, m.etiqueta]));
    return (mes: number) => porMes.get(mes) ?? `Mes ${mes}`;
  }, [datos?.meses]);

  return (
    <div
      className="flex flex-col h-screen overflow-hidden"
      style={{ backgroundColor: '#D5D4DC', background: MESH_GRADIENT }}
    >
      <ObraTabs obraId={obraId} activa="control" obraNombre={datos?.obra_nombre ?? '…'} />

      <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-4">
        {cargando && !datos && (
          <div className="flex items-center justify-center h-64">
            <p style={{ color: TEXTO_2 }}>Cargando el control de obra…</p>
          </div>
        )}

        {error && <AvisoError mensaje={error} />}

        {datos && !error && (
          <>
            <div className="px-1">
              <h2 className="text-xl font-bold" style={{ color: TEXTO }}>
                Control de obra
              </h2>
              <p className="text-sm" style={{ color: TEXTO_2 }}>
                {datos.mes_actual === null
                  ? 'Cómo va la obra contra lo presupuestado y lo planificado.'
                  : `Mes ${datos.mes_actual} de ${datos.meses_totales} · cómo va la obra contra lo presupuestado y lo planificado.`}
              </p>
            </div>

            {/* Lo que la pantalla tiene que aclarar antes de que alguien saque
                conclusiones de un número incompleto. */}
            {datos.avisos.length > 0 && (
              <div
                className="p-3 rounded-xl flex flex-col gap-1"
                style={{ background: AMBAR_FONDO, border: '1px solid rgba(245, 166, 35, 0.35)' }}
              >
                {datos.avisos.map((aviso) => (
                  <p key={aviso} className="text-sm" style={{ color: AMBAR }}>
                    {aviso}
                  </p>
                ))}
              </div>
            )}

            <SelectorPeriodo
              rango={datos.rango}
              mesActual={datos.mes_actual}
              mesesTotales={datos.meses_totales}
              etiquetaDeMes={etiquetaDeMes}
              onCambiar={cambiarPeriodo}
              cargando={cargando}
            />

            {datos.cascada.base_material === 0 && datos.rubros.length === 0 ? (
              <section style={GLASS_CARD} className="p-8 text-center">
                <p className="text-sm" style={{ color: TEXTO_2 }}>
                  {datos.rango === null
                    ? 'Todavía no hay certificaciones en esta obra.'
                    : `No hay nada certificado en ${datos.rango.etiqueta.toLowerCase()}.`}
                </p>
                <p className="text-sm mt-1" style={{ color: TEXTO_3 }}>
                  {datos.rango === null
                    ? 'El control compara lo ejecutado contra lo presupuestado: en cuanto registres la primera certificación, acá vas a ver los tres desvíos en plata.'
                    : 'Probá con otro período, o con “Toda la obra”.'}
                </p>
              </section>
            ) : (
              <>
                <ResumenControl datos={datos} />
                <CurvaAvance
                  meses={datos.meses}
                  totalPresupuesto={datos.total_presupuesto}
                  rango={datos.rango}
                />
                <TablaRubros rubros={datos.rubros} />
                <TablaMateriales materiales={datos.materiales} />
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
