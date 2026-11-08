/* Was mehrere Teile von `de` brauchen; eigene Datei, damit kein Teil `de.ts` importiert. */

import type { LaufFehlerCode } from '../../shared/laufFehler.ts';

/** Prueft die Schluessel gegen die Codes; nachgeschlagen wird mit beliebigem String und Rueckfall auf `sonst`. */
export type CodeTexte<T> = Partial<Record<LaufFehlerCode | 'E_SPERRE', T>>;

/** Wo `funds.json` und `einstellungen.json` liegen [ADR-037] — beide Plattformen, die Seite weiss nicht, welche. */
export const DATENORDNER = 'im Datenordner von Scapio (macOS: ~/Library/Application Support/scapio, Windows: %LOCALAPPDATA%\\scapio)';
