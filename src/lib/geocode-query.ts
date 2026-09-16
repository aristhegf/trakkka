const ROMAN: Record<string, string> = { "1": "I", "2": "II", "3": "III", "4": "IV", "5": "V" };

/**
 * OpenStreetMap names several Lagos estates with Roman numerals ("Lekki Phase I") while people type
 * "Lekki Phase 1", which Nominatim does not match. Used as a retry when the raw query finds nothing.
 */
export function romanisePhase(q: string): string {
  return q.replace(/\b(phase)\s*([1-5])\b/gi, (_m, word: string, n: string) => `${word} ${ROMAN[n]}`);
}
