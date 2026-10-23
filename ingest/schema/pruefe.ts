import type { z } from 'zod';
import type { LaufFehlerCode } from '../../shared/laufFehler.ts';

// ---------------------------------------------------------------------------

/**
 * Einheitlicher Fehler fuer alles, was die Validierung nicht besteht.
 * Die Meldung nennt Pfad und Grund — nie den Wert, der sie ausgeloest hat. [INV-12]
 */
export class SchemaFehler extends Error {
  readonly code = 'E_SCHEMA' satisfies LaufFehlerCode;
  readonly quelle: string;

  constructor(quelle: string, stellen: readonly string[]) {
    super(`Antwort von ${quelle} passt nicht zum Schema: ${stellen.join('; ')}`);
    this.name = 'SchemaFehler';
    this.quelle = quelle;
  }
}

const HARMLOSER_SCHLUESSEL = /^[A-Za-z0-9_.-]{1,64}$/;
const MAX_SCHLUESSEL = 5;

function schluesselName(schluessel: string): string {
  return HARMLOSER_SCHLUESSEL.test(schluessel) ? schluessel : '?';
}

/** Validiert und wirft `SchemaFehler` — ohne je einen fremden Wert in die Meldung zu nehmen. */
export function pruefe<T>(quelle: string, schema: z.ZodType<T, unknown>, roh: unknown): T {
  const ergebnis = schema.safeParse(roh);
  if (ergebnis.success) return ergebnis.data;

  // `message` nur dort, wo wir sie selbst geschrieben haben (`custom`, z. B. "Betrag nicht
  // lesbar" — nennt Typ und Laenge, nie den Wert) oder wo zod nur den Schluesselnamen nennt
  // (`unrecognized_keys` — der Schluessel der Antwort ist aber trotzdem fremder Text: nur
  // harmlose Namen erscheinen woertlich, alles andere wird zu `?`, damit keine Escape-Sequenz
  // und kein langer Text im Protokoll landet). Bei `invalid_value`
  // und aehnlichen uebernimmt zods eigene Meldung sonst den fremden Wert woertlich in den
  // Text; dort bleibt es bei `code`. [INV-12]
  const stellen = ergebnis.error.issues.slice(0, 10).map((i) => {
    const pfad = i.path.map(String).join('.') || '(Wurzel)';
    if (i.code === 'custom') return `${pfad}: ${i.message}`;
    if (i.code === 'unrecognized_keys') {
      return `${pfad}: unrecognized_keys (${i.keys.slice(0, MAX_SCHLUESSEL).map(schluesselName).join(', ')})`;
    }
    return `${pfad}: ${i.code}`;
  });
  throw new SchemaFehler(quelle, stellen);
}
