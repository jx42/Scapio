/**
 * Entschaerft Formel-Injektion in Fremdtext, bevor er die Datenbank erreicht.
 *
 * Ein fuehrendes `=`, `+`, `-` oder `@` macht aus einem Textfeld eine Formel, sobald
 * jemand die Daten in eine Tabellenkalkulation exportiert. Der Wert landet zwar nie
 * direkt in einer solchen, aber er landet in der Datenbank und von dort in der
 * Oberflaeche, und ein Feld, das anderswo zu Code wird, soll hier gar nicht erst
 * entstehen. Zahlen mit fuehrendem Minus sind davon ausgenommen. [INV-06]
 */

/** Sieht wie eine Zahl aus? Dann ist ein fuehrendes Minus ein Vorzeichen, keine Formel. */
const ZAHL = /^-?[\d.,\s]+%?$/;

/**
 * Entschaerft Formel-Injektion, ohne den Wert zu verfaelschen: ein Apostroph davor
 * macht aus der Formel Text und bleibt sichtbar erkennbar.
 */
export function entschaerfe(feld: string): string {
  if (feld.length === 0) return feld;
  const erstes = feld.charCodeAt(0);
  const gefaehrlich = erstes === 61 || erstes === 43 || erstes === 45 || erstes === 64; // = + - @
  if (!gefaehrlich) return feld;
  if (ZAHL.test(feld)) return feld;
  return `'${feld}`;
}
