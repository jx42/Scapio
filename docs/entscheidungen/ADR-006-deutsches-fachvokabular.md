# ADR-006: Deutsches Fachvokabular, englisches Technikvokabular

## Kontext

Die Anwendung zeigt ein einzelnes Depot, und wer sie benutzt, liest Deutsch — die Oberfläche
ist deutsch, die Kontoauszüge der Bank sind es auch. Gängige Praxis in deutschsprachigen Softwareprojekten ist trotzdem,
konsequent englisch zu benennen — Bezeichner, Kommentare, sogar Oberflächentexte — weil das
den Anschluss an Bibliotheken, Beispiele und künftige Mitwirkende erleichtert. Für ein
Projekt, dessen Gegenstand ein deutsches Depot mit deutschen Steuerbegriffen ist, wiegt
dieser Vorteil weniger als die Kosten:
ein „Holdings“-Feld oder ein „Yield“-Kennzahlname zwingt genau die Übersetzungsarbeit im Kopf,
die die Anwendung eigentlich abnehmen soll.

## Entscheidung

Fachvokabular — alles, was etwas über *dieses Depot* aussagt (Bestand, Kurs, Menge,
Einstand, Zufluss, Sparplan, Lauf) — ist deutsch, durchgängig von der Datenbankspalte bis
zum Oberflächentext. Technisches Vokabular — alles, was beschreibt, *wie* die Software
gebaut ist (Router, Query, Cache, Hook, Migration, Repository) — bleibt englisch, wie in der
Branche üblich. Die vollständige Liste und die begründeten Grenzfälle stehen in
[GLOSSAR.md](../GLOSSAR.md); dort werden sie nachgeschlagen, nicht neu entschieden.

## Folgen

- Ein Datenbankdump, ein Fehlertext oder ein Variablenname liest sich ohne gedankliche
  Übersetzung.
- Neue Mitwirkende (menschlich oder als Sprachmodell) müssen [GLOSSAR.md](../GLOSSAR.md)
  vor einer Namensentscheidung konsultieren, statt der Konvention der jeweils zuletzt
  gelesenen Datei zu folgen — das verhindert eine schleichende Vermischung.
- Deutsche Bezeichner mit Umlauten sind im Code selbst vermieden (`Bestaende` statt
  `Bestände`) — eine reine Zeichensatz-Vorsichtsmaßnahme, keine Ausnahme von der
  Sprachregel; Oberflächentexte und Dokumentation verwenden Umlaute normal.
