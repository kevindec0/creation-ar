/**
 * Umbrales orientativos de "puntos de reconocimiento" que MindAR encuentra al compilar una imagen.
 * Con pocos puntos la cámara tarda en reconocer la obra o la pierde con facilidad.
 * Calibrados con imágenes de prueba: una imagen casi lisa da ~0-200 puntos, una con
 * detalle moderado ~700 y una muy detallada más de 1300. Ajústalos según tus obras.
 */
export const QUALITY = { low: 500, good: 1200 } as const;

export function qualityLevel(points: number) {
  if (points >= QUALITY.good) return { level: "good", label: "Fácil de reconocer" } as const;
  if (points >= QUALITY.low) return { level: "fair", label: "Reconocimiento aceptable" } as const;
  return { level: "poor", label: "Difícil de reconocer" } as const;
}
