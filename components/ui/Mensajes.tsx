// Avisos en pantalla.
//
// Por convención del proyecto los errores SIEMPRE se ven en la pantalla, nunca
// solo en la consola. Estos dos componentes son ese aviso, para que el rojo y
// el radio sean los mismos en todas las vistas.

import {
  ROJO,
  ROJO_BORDE,
  ROJO_FONDO,
  VERDE,
  VERDE_FONDO,
} from './estiloPragma';

export function MensajeError({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="p-3 rounded-xl"
      style={{ background: ROJO_FONDO, border: ROJO_BORDE }}
    >
      <p className="text-sm font-medium" style={{ color: ROJO }}>
        {children}
      </p>
    </div>
  );
}

export function MensajeExito({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="p-3 rounded-xl"
      style={{
        background: VERDE_FONDO,
        border: '1px solid rgba(34, 197, 94, 0.30)',
      }}
    >
      <p className="text-sm font-medium" style={{ color: VERDE }}>
        {children}
      </p>
    </div>
  );
}
