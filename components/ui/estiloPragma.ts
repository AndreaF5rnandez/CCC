// Tokens del sistema de diseño Pragma (glassmorphism).
//
// Estaban repetidos al principio de cada pantalla de obra. Viven acá para que
// una card de Compras y una de Certificación no puedan tener distinto blur.
// Los valores salen de la skill de diseño: no inventar variantes nuevas.

import type { CSSProperties } from 'react';

/** Fondo de la app: nunca un color plano, siempre el mesh gradient. */
export const MESH_GRADIENT = [
  'radial-gradient(ellipse at 15% 80%, rgba(200, 230, 76, 0.12) 0%, transparent 50%)',
  'radial-gradient(ellipse at 85% 20%, rgba(200, 180, 220, 0.15) 0%, transparent 50%)',
  'radial-gradient(ellipse at 80% 85%, rgba(180, 220, 210, 0.12) 0%, transparent 50%)',
  'radial-gradient(ellipse at 50% 50%, rgba(215, 210, 220, 0.3) 0%, transparent 70%)',
  'linear-gradient(135deg, #D8D6DE 0%, #CDCBD5 50%, #D2D0D8 100%)',
].join(', ');

export const GLASS_CARD: CSSProperties = {
  background: 'rgba(255, 255, 255, 0.55)',
  backdropFilter: 'blur(20px)',
  WebkitBackdropFilter: 'blur(20px)',
  border: '1px solid rgba(255, 255, 255, 0.60)',
  borderRadius: '16px',
  boxShadow: '0 8px 32px rgba(0, 0, 0, 0.06)',
};

export const INPUT: CSSProperties = {
  padding: '10px 14px',
  border: '1px solid rgba(0, 0, 0, 0.12)',
  borderRadius: '10px',
  fontSize: '14px',
  color: '#1A1A2E',
  background: 'rgba(255, 255, 255, 0.6)',
  backdropFilter: 'blur(8px)',
  outline: 'none',
};

export const ACENTO = '#C8E64C';
export const ACENTO_TEXTO = '#2A3300';
export const TEXTO = '#1A1A2E';
export const TEXTO_2 = '#6B7080';
export const TEXTO_3 = '#9CA3AF';

/** Separador de secciones dentro de una card. */
export const BORDE_SUTIL = '1px solid rgba(0, 0, 0, 0.06)';
/** Separador entre filas de tabla: todavía más tenue que el de sección. */
export const BORDE_FILA = '1px solid rgba(0, 0, 0, 0.04)';

/* ─── Colores semánticos del desvío ────────────────────────────────────────── */

/** Rojo de alerta: se gastó o se consumió de más. */
export const ROJO = '#DC2626';
export const ROJO_FONDO = 'rgba(239, 68, 68, 0.12)';
export const ROJO_BORDE = '1px solid rgba(239, 68, 68, 0.30)';

/** Verde: se gastó o se consumió de menos, y estados en línea. */
export const VERDE = '#15803D';
export const VERDE_FONDO = 'rgba(34, 197, 94, 0.12)';

/** Ámbar: algo que no estaba previsto y hay que mirar. */
export const AMBAR = '#B45309';
export const AMBAR_FONDO = 'rgba(245, 166, 35, 0.15)';

/** Gris: existe pero no tiene con qué compararse. */
export const GRIS_FONDO = 'rgba(107, 112, 128, 0.12)';
