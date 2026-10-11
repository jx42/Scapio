/**
 * Kleine Summen ueber Anteile (0..1) fuer Aufteilung und Top25 — vorher inline in den
 * Kacheln, dort aber ausserhalb von core/ nicht testbar. [INV-04]
 */

/** Was die Positionsanteile offen lassen, ist Cash. Auf 0..1 begrenzt. */
export function restAnteil(anteile: readonly number[]): number {
  let belegt = 0;
  for (const a of anteile) belegt += Number.isFinite(a) ? a : 0;
  const rest = 1 - belegt;
  return rest > 0 && rest <= 1 ? rest : 0;
}

/** Summe der Depotanteile ueber alle Top25-Zeilen. */
export function summeAnteile(anteile: readonly number[]): number {
  let summe = 0;
  for (const a of anteile) summe += Number.isFinite(a) ? a : 0;
  return summe;
}
