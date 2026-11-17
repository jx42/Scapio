/*
 * Aufteilung, Dialog, wenn kein Fonds aufgeschlüsselt ist: welche Anbieter Scapio selbst erkennt
 * [ADR-065], dann die Kurzanleitung zu `funds.json` im Datenverzeichnis [ADR-037].
 *
 * Ohne aufgeschlüsselten Fonds hat die Aufteilung keine Reiter — ein Laie findet sonst nirgends im
 * laufenden Programm einen Hinweis darauf, woran das liegt. Dieselben Schritte stehen
 * ausfuehrlicher im `hinweis`-Feld von `ingest/funds.example.json`; hier die Kurzfassung,
 * dort wo sie im Moment des Bedarfs sichtbar ist.
 */

import { de } from '@/i18n/de';

export function Top25FondsAnleitung() {
  return (
    <>
      <p className="text-sm text-text-leise">{de.top25.leerAnleitungAutomatisch}</p>
      <p className="text-sm text-text-leise">{de.top25.leerAnleitungVonHand}</p>
      <ol className="list-decimal space-y-1 pl-5 text-sm text-text-leise">
        {de.top25.leerAnleitungSchritte.map((schritt) => (
          <li key={schritt}>{schritt}</li>
        ))}
      </ol>
    </>
  );
}
