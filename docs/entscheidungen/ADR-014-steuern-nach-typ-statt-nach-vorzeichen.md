# ADR-014: Zinsen und Steuern nach Typ trennen, nicht nach Vorzeichen

## Kontext

Die Kennzahlentafel führt zwei Zeilen nebeneinander: „Zinsen und Erträge" und „Steuern".
Beide entstanden in `core/kennzahlen.ts` aus derselben Schleife über die Transaktionen, und
die Zuordnung geschah über das Vorzeichen des Betrags: positiv galt als Ertrag, negativ als
Steuer. Das sah eine Zeit lang richtig aus, weil Steuern nun einmal abgezogen werden.

Es ist an drei Stellen falsch, und die dritte ist die schlimme:

1. **Eine Steuererstattung ist positiv.** `TAX_RETURN` landete deshalb im Ertragstopf. Im
   Dialog „Zinsen und Erträge" standen Zeilen mit der Beschriftung „Steuern" und einem
   Pluszeichen — für den Leser ein Vorzeichenfehler, tatsächlich eine Erstattung am
   falschen Ort.
2. **Negative Zinsen sind keine Steuer.** Der Sollzins auf dem Verrechnungskonto
   (`INTEREST` mit negativem Betrag, in dieser Historie zweimal aufgetreten) rutschte in
   den Steuertopf und wurde dort als „Zinsen" beschriftet.
3. **Der eigentliche Steuerabzug fehlte vollständig.** `TAX` — Vorabpauschale und
   Kapitalertragsteuer — ist in `core/typen.ts` als **intern** eingeordnet, mit gutem
   Grund: es ist keine vom Anleger veranlasste Kapitalbewegung und darf die Rendite nicht
   als Ein- oder Auszahlung verschieben [P-05]. Die Schleife sprang aber über alles, was
   nicht `einordnen(typ) === 'ertrag'` war. `TAX` fiel damit aus **beiden** Töpfen.

Die Wirkung auf das Depot, an dem das auffiel: die Kennzahl „Steuern" zeigte einen
einstelligen Eurobetrag statt eines dreistelligen, lag also um mehr als das Hundertfache
daneben — und nannte dabei genau die beiden Buchungen, die keine Steuern sind.

Der Erklärungstext der Zeile beschrieb die ganze Zeit das Richtige: „Auf Erträge und
Verkäufe einbehaltene Steuern, saldiert mit späteren Erstattungen zu einem einzigen
Betrag." Nur gerechnet wurde etwas anderes.

## Entscheidung

Die Trennung geschieht nach dem **Typ** der Buchung, nicht nach dem Vorzeichen ihres
Betrags. `core/typen.ts` führt dafür eine Liste `STEUER_TYPEN = { TAX, TAX_RETURN }` und
das Prädikat `istSteuer(typ)`:

- **Steuern** ist die Summe über `STEUER_TYPEN` — Abzug negativ, Erstattung positiv,
  saldiert zu einer Zahl. Genau das, was der Erklärungstext verspricht.
- **Zinsen und Erträge** ist die Summe über die Ertragstypen ohne `TAX_RETURN`, also
  `INTEREST`, `DIVIDEND`, `DISTRIBUTION`, `BONUS`. Ein negativer Sollzins bleibt darin und
  mindert die Summe — er ist ein negativer Ertrag, keine Steuer.

`STEUER_TYPEN` liegt **quer** zu `einordnen()` und ersetzt sie nicht. Die Einordnung
entscheidet über XIRR, TWR und die Depotreihe und bleibt unverändert: `TAX` ist weiter
intern, `TAX_RETURN` weiter Ertrag. Eine vierte Einordnung `'steuer'` einzuführen wäre der
naheliegende Weg gewesen und der falsche — sie hätte die folgenreichste Entscheidung des
Projekts [P-05] angefasst, um eine Anzeigezeile zu reparieren.

## Die zweite Frage: wofür

Mit der richtigen Zuordnung stellt sich sofort die nächste: Eine Zeile „Steuerabzug"
mit Betrag sagt nicht, worauf. Die Bank liefert die Antwort in `cash.relatedIsin`, und der
Ingest hat sie bis hierher weggeworfen.

Sie kommt als **eigene Spalte** `bezug_isin` in die Tabelle, nicht in `isin`. Das ist der
Kern dieser Teilentscheidung: `isin` steuert Mengenreihe, FIFO und Einstand. Eine
Steuerbuchung bewegt keine Stücke; trüge sie dort eine ISIN, entstünde eine Position mit
Menge null und negativem Betrag — eine Phantomposition in Aufteilung, Top 25 und
Einstandsrechnung. `bezug_isin` wird ausschließlich angezeigt, nie gerechnet; kein
Rechenkernpfad liest sie außer dem, der die Dialogzeile beschriftet.

Fehlt das Feld, sagt die Oberfläche „ohne Angabe". Die ISIN steht in diesen Fällen zwar in
`beschreibung` — „Vorabpauschale: Muster-ETF Welt (IE00BPLATZH1)" —, und ein
regulärer Ausdruck darüber wäre in fünf Minuten geschrieben. Er kommt trotzdem nicht:
`beschreibung` ist Fremdtext, den die Anwendung anzeigt und nie auswertet [INV-06]. Ein
Muster darüber wäre eine Bank-Formatierung, die sich ohne Ankündigung ändert, an einer
Stelle, an der ein falscher Treffer eine Steuer dem falschen ETF zuordnete. Lieber eine
ehrliche Lücke als eine geratene Zuordnung.

Von den sieben Steuerbuchungen des Referenzdepots trägt die Bank fünf ein `relatedIsin`; zwei
Vorabpauschalen und beide Erstattungen bleiben „ohne Angabe". Zinsen
tragen nie eines — sie fallen auf dem Verrechnungskonto an, und genau das steht dann dort.

## Konsequenzen

- Die Kennzahl „Steuern" ändert sich für jedes bestehende Depot, und zwar deutlich. Das ist
  eine Korrektur, keine Definitionsänderung: die Zahl beantwortet ab jetzt die Frage, die
  über ihr steht.
- `KERN_VERSION` steigt auf 21. Die Historie wird beim nächsten Lauf neu gerechnet, obwohl
  weder `zinsenCent` noch `steuernCent` in `depot_tag` eingehen — INV-10 wird nicht
  abgewogen, sondern befolgt.
- Ein unbekannter Steuertyp einer künftigen Bank fällt weiterhin in keinen der beiden
  Töpfe. Das ist die gleiche bewusste Zurückhaltung wie bei `einordnen()`: der Ingest
  vermerkt den unbekannten Typ als Hinweis im Lauf, statt ihn stillschweigend
  einzusortieren.
- `bezug_isin` bleibt auf allen bestehenden Zeilen `NULL`, bis der nächste Lauf sie
  überschreibt. Das braucht keine Datenwanderung — wohl aber einen Import, der die
  Änderung überhaupt bemerkt. Der Satz „der Import schreibt jede Transaktion ohnehin neu"
  stimmte nicht: `importiere()` vergleicht Feld für Feld und schreibt nur, was sich
  unterscheidet, damit `gesehen_am` und mit ihm die Hochwassermarke stehen bleiben
  [INV-09]. Der Vergleich kannte `bezug_isin` nicht, hielt jede Zeile für unverändert und
  ließ die Spalte auch nach mehreren Läufen leer. Die Liste der verglichenen Felder ist
  seitdem kein handgepflegter `&&`-Ausdruck mehr, sondern ein Objekt mit
  `satisfies Record<Exclude<keyof Tx, 'id'>, true>`: die nächste Spalte, die dort fehlt,
  ist ein Typfehler und keine stille Lücke in den Daten.
- Die mittlere Spalte des Detaildialogs heißt bei Erträgen und Steuern „Wofür" und bei
  realisierten Verkäufen weiter „Position" — dieselbe Tabelle, ein Prop für die
  Spaltenüberschrift, keine vierte Spalte.
- Die Beschriftungen in `src/i18n/de.ts` folgen der Sache: `TAX_RETURN` heißt jetzt
  „Steuererstattung" statt „Steuern", `TAX` heißt „Steuerabzug". Ein Dialog, in dem alle
  Zeilen „Steuern" heißen, sagt über die einzelne Zeile nichts.
