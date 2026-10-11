/**
 * zod-Schemata ALLER fremden Antworten. [INV-12]
 *
 * `.strict()` ueberall, Obergrenzen fuer jedes Array und jede
 * Zeichenkette. Ein Schema, das alles durchlaesst, prueft nichts. Neue oder umbenannte
 * Felder sollen hier AUFFALLEN — ein Ingest, der stillschweigend weiterlaeuft, waehrend
 * die Bank ein Feld umbenennt, transportiert falsche Kontostaende.
 *
 * Geld, Menge und Kurs gehen ausschliesslich durch `zuCent`/`zuMengeE8`/`zuKursE6`.
 * `parseFloat` und `Number()` auf einen Betrag sind verboten. [INV-02]
 *
 * Die Scalable-Schemata (`HoldingsAntwort`, `TransaktionenAntwort`, `SparplaeneAntwort`,
 * `CashBreakdownAntwort`, `OverviewAntwort`, `Wertpapierantwort`) sind gegen echte
 * Antworten verifiziert, nicht nur geraten. `npm run vertrag`
 * ruft jedes lesende Tool genau einmal auf und prueft jedes Schema dieser Datei gegen die
 * echte Antwort; abweichende Feldnamen fallen dort auf und werden HIER korrigiert, nicht
 * durch Aufweichen von `.strict()`.
 *
 * Die Schemata selbst liegen in `schema/`, ein Modul je Quelle — dieselben Namen wie in
 * `ingest/quellen/`. Diese Datei bleibt die eine Adresse: wer `ingest/schema.ts` importiert,
 * bekommt alles, und niemand muss wissen, in welchem Teil ein Schema steht. Wer an einem
 * einzelnen Schema arbeitet, oeffnet das Modul statt der ganzen Sammlung.
 */

export * from './schema/grundlagen.ts';
export * from './schema/holdings.ts';
export * from './schema/transaktionen.ts';
export * from './schema/kurse.ts';
export * from './schema/sparplaene.ts';
export * from './schema/wertpapier.ts';
export * from './schema/cash.ts';
export * from './schema/ishares.ts';
export * from './schema/xtrackers.ts';
export * from './schema/amundi.ts';
export * from './schema/vpi.ts';
export * from './schema/zins.ts';
export * from './schema/dateien.ts';
export * from './schema/pruefe.ts';
