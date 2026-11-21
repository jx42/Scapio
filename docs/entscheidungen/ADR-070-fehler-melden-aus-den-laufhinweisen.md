# ADR-070: „Fehler melden“, wo nur eine neue Version hilft

## Kontext

Manche Codes eines Laufs lassen sich nur mit einer neuen Version beheben: Eine Schnittstelle hat
sich geändert (`E_SCHEMA`, `E_MCP_RPC`, …), ein Anbieter ist auf eine neue Domain umgezogen
(`E_NETZ_HOST`), oder Scalable Capital liefert Fremdwährung (`E_WAEHRUNG`). Die Meldung rät dann,
die neueste Version zu holen. Gibt es die noch nicht, erfährt der Entwickler davon nur, wenn
jemand den Fehler meldet, und der Weg zum Issue-Formular stand bisher nirgends auf der Seite.
Dasselbe gilt für Programmfehler: eine Kachel, die beim Zeichnen abstürzt, oder ein Lauf, der an
einer unerwarteten Stelle scheitert (`E_UNBEKANNT`).

## Entscheidung

`<FehlerMelden>` (`src/components/FehlerMelden.tsx`) steht an drei Stellen:

- bei gescheitertem Lauf und gescheiterter Quelle mit einem Code aus `meldenSinnvoll`
  (`src/lib/quellenMeldung.ts`): die Schnittstellen-Codes, `E_NETZ_HOST`, `E_WAEHRUNG`,
  `E_UNBEKANNT`. Bei `E_UNBEKANNT` bleibt „Aktualisieren“ daneben stehen;
- bei Laufhinweisen, deren Abhilfe eine neue Version ist (`hinweisMelden` in
  `src/lib/hinweisText.ts`), neben dem X;
- im Absturzzustand einer Kachel (`Fehlergrenze`), nicht bei einem Ausfall der API.

Der Knopf verlinkt fest auf
`https://github.com/jx42/Scapio/issues/new?template=bug.yml`. Der Eintrag in
`ERLAUBTE_AUSGEHENDE_LINKS` ist auf genau diese Adresse verankert. Es gelten dieselben Bedingungen
wie in ADR-021/ADR-022: `target="_blank"`, `rel="noopener noreferrer"`, kein automatischer Abruf.

Die Adresse enthält weder den Code noch einen anderen Wert. Code und Titel lassen sich in der Query
vorbelegen, aber ein `href` aus einem Wert verbietet INV-06 ohne Abwägung. Stattdessen fragt das
Formular `bug.yml` nach dem Code aus der Meldung.

## Verworfene Alternativen

- **Code in der Query vorbelegen:** bequemer, aber ein `href` aus einem Wert (INV-06). Der Code ist
  zwar kein Fremdtext, die Prüfung soll aber nicht zwischen Werten unterscheiden müssen.
- **Knopf bei jedem Fehler:** Drosselung, Zeitlimit oder Netzausfall lösen sich von selbst; eine
  Meldung dazu hilft niemandem. Ebenso eine Abweichung der Selbstkontrolle oder `E_PLAUSIBEL`:
  Dort liegt es meist an den Daten der Bank, nicht an Scapio.

## Folgen

- Zehn ausgehende Ziele statt neun; das neue erscheint auch in der lokalen App.
- Eine neue Hinweisart oder ein neuer Code, dessen Abhilfe eine neue Version ist, gehört in
  `NEUE_VERSION` bzw. `meldenSinnvoll`.
- Die Meldung verlässt den Rechner nur, wenn der Nutzer das Formular selbst ausfüllt und absendet;
  `bug.yml` weist darauf hin, Depotwerte vorher zu entfernen.
