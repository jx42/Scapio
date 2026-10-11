/*
 * Das Session-Token fuer POST /api/refresh.
 *
 * Es steht ausschliesslich im <meta name="portfolio-token"> der ausgelieferten
 * index.html. Nicht im localStorage — dort ueberlebt es die Sitzung und jedes fremde
 * Skript im selben Ursprung kaeme daran. Nicht in einer URL — dort landet es im
 * Verlauf und in jedem Protokoll. Nicht in einem Log. Deshalb gibt es hier genau eine
 * lesende Funktion und keine schreibende.
 */

const META_NAME = 'portfolio-token';

/** Der unersetzte Platzhalter aus der Quelldatei gilt als "kein Token". */
const PLATZHALTER = '__PORTFOLIO_TOKEN__';

/**
 * Liest das Token aus dem Dokument. `null`, wenn die Seite nicht vom lokalen Server
 * ausgeliefert wurde — dann bleibt der Aktualisieren-Knopf gesperrt, statt eine
 * Anfrage zu schicken, die der Server ohnehin mit 403 beantwortet.
 */
export function sessionToken(): string | null {
  if (typeof document === 'undefined') return null;
  const meta = document.querySelector(`meta[name="${META_NAME}"]`);
  const inhalt = meta?.getAttribute('content')?.trim() ?? '';
  if (inhalt === '' || inhalt === PLATZHALTER) return null;
  return inhalt;
}

/** Gibt es ueberhaupt ein Token? Steuert nur die Bedienbarkeit, nie eine Anzeige des Werts. */
export function tokenVorhanden(): boolean {
  return sessionToken() !== null;
}
