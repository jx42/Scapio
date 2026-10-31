/*
 * Aufteilung, Dialog, wenn kein Fonds bekannt ist: Kurzanleitung zum Anlegen von
 * `funds.json` im Datenverzeichnis [ADR-037].
 *
 * Ohne diese Datei hat die Aufteilung keine Reiter — ein Laie findet sonst nirgends im laufenden
 * Programm einen Hinweis darauf, wie er sie befuellt. Dieselben Schritte stehen
 * ausfuehrlicher im `hinweis`-Feld von `ingest/funds.example.json`; hier die Kurzfassung,
 * dort wo sie im Moment des Bedarfs sichtbar ist.
 */

import { de } from '@/i18n/de';

export function Top25FondsAnleitung() {
  return (
    <ol className="list-decimal space-y-1 pl-5 text-sm text-text-leise">
      {de.top25.leerAnleitungSchritte.map((schritt) => (
        <li key={schritt}>{schritt}</li>
      ))}
    </ol>
  );
}
