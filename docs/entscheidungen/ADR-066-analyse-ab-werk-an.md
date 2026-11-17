# ADR-066: Analyse ab Werk an

Löst die Vorgabe `false` aus [ADR-038](ADR-038-top25-nur-auf-wunsch.md) ab. Schalter, Weg über
`/api/health` und übersprungener Fondsschritt bleiben.

## Kontext

ADR-038 schaltete `top25` ab Werk aus, weil die Kachel nach der Installation für viele leer,
lückenhaft oder voller Hinweise war: iShares brauchte `funds.json`, andere Häuser als iShares,
Xtrackers und Amundi fehlten ganz. Seit [ADR-065](ADR-065-fondsaufloesung-ohne-funds-json.md)
erkennt Scapio sieben Anbieter selbst, iShares über die Suche je ISIN. Der Grund für die
Vorgabe `false` trägt nicht mehr; ausgeschaltet bleibt der Reiter Analyse dagegen für fast
alle unentdeckt, weil ihn erst die Vorlage `einstellungen.example.json` einschaltet.

## Entscheidung

- **`top25` hat die Vorgabe `true`.** Ausgeschaltet wird mit `"top25": false` in
  `einstellungen.json`; die Vorlage `docs/einstellungen.example.json` ist jetzt die
  Ausschaltvariante und nennt im Feld `hinweis`, was die Anbieter erfahren.
- Ein ausdrücklich gesetzter Wert in einer bestehenden `einstellungen.json` gilt weiter.

## Verworfene Alternativen

- **Bei `false` bleiben, Hinweis in der Oberfläche.** Ein Hinweis auf einen Schalter, den man
  nur in einer Datei umlegen kann, ersetzt nicht die Kachel; ein Schalter in der Oberfläche
  bräuchte eine dritte mutierende Route (INV-08).
- **Beim ersten Start fragen.** Dafür gibt es keinen Dialog vor dem ersten Lauf
  ([ADR-064](ADR-064-lauf-beim-start.md)), und die Antwort müsste geschrieben werden — wieder
  eine mutierende Route.

## Folgen

- Restrisiko 3 in [SICHERHEIT.md](../SICHERHEIT.md) gilt ab Werk: Ohne Zutun erfahren die
  sieben Anbieter beim ersten Lauf, welche ihrer ETFs im Depot liegen — keine Mengen, keine
  Beträge. Wer das nicht will, setzt `"top25": false`, bevor Scapio zum ersten Mal läuft.
- Nach dem Update ist der Reiter Analyse auch bei bestehenden Installationen ohne
  `top25`-Eintrag an; der nächste Lauf ruft die Anbieter ab.
