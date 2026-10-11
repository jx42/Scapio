# ADR-038: Top 25 nur auf Wunsch, Schalter in `einstellungen.json`

## Kontext

Die Kachel „Top 25 Unternehmen“ hängt an Schnittstellen von iShares, Xtrackers und Amundi,
die nicht offiziell dokumentiert sind. iShares-Fonds brauchen oft eine `funds.json`, ETFs
anderer Häuser bleiben ganz außen vor. Für viele Nutzer ist die Kachel deshalb nach der
Installation leer, unvollständig oder voller Hinweise. Das schadet dem ersten Eindruck mehr,
als die Kachel nützt. Mit [ADR-034](ADR-034-kachel-ausblenden-im-browser.md) lässt sie sich
zwar ausblenden, aber erst, nachdem man sie gesehen hat. Der Ingest fragt die Anbieter
trotzdem weiter ab.

## Entscheidung

- **Schlüssel `top25` in `einstellungen.json`, Vorgabe `false`.** Eingeschaltet wird von Hand,
  danach muss Scapio neu starten. Die Vorlage `einstellungen.example.json` im Projektordner
  enthält `"top25": true` und eine Anleitung im Feld `hinweis`, das `shared/konfiguration.ts`
  annimmt und verwirft.
- **Der Ingest lässt ohne den Schalter beide Fondsschritte aus**, also `funds.json` und die
  automatische Auflösung über die Kataloge. Der Schritt `fonds` meldet `übersprungen`. Kein
  Abruf geht an einen Fondsanbieter, und es entstehen keine Hinweise `fondsNichtAbrufbar`.
- **Die Oberfläche erfährt den Schalter aus `/api/health`** (`top25`), nicht aus
  `/api/top25`. Die Antwort von `/api/health` liegt vor der ersten Kachel vor. Deshalb erscheint
  bei ausgeschaltetem Schalter kein Ladezustand, der danach wieder verschwindet, und
  `/api/top25` wird gar nicht erst abgefragt.

## Verworfene Alternativen

- **Schalter in `funds.json`, „an und Fonds eingetragen“.** Xtrackers und Amundi werden ohne
  `funds.json` erkannt ([ADR-018](ADR-018-fondskataloge-statt-einzelabfrage.md)). Wer nur diese
  Häuser hält, müsste dann Fonds eintragen, die Scapio schon kennt. Außerdem ist `funds.json`
  eine Fondsliste, keine Einstellungsdatei.
- **Die Kachel erst ab einer Mindestabdeckung zeigen.** Die Kachel erschiene und verschwände
  je nach Lauf, ein teilweise abgedecktes Depot erführe nie von ihr, und der Ingest riefe
  die Anbieter weiter ab.
- **Standardmäßig im Browser ausgeblendet ([ADR-034](ADR-034-kachel-ausblenden-im-browser.md)
  umgekehrt).** Der Schalter gälte nur je Browser, wäre kaum zu finden, und die Abrufe
  liefen weiter.
- **Ein Schalter in der Oberfläche.** Er bräuchte eine dritte mutierende Route (INV-08,
  [ADR-012](ADR-012-anmeldeknopf-als-zweite-mutierende-route.md)).

## Folgen

- Eingeschaltet erfahren die Anbieter über die abgerufenen ISINs, welche ihrer ETFs im Depot
  liegen. Nachgetragen 2026-10-07 als Restrisiko 3 in [SICHERHEIT.md](../SICHERHEIT.md), mit
  einem Satz in Vorlage und README.
- Nach einem Update fehlt die Kachel auch bei bestehenden Installationen, bis dort
  `"top25": true` steht. Der Start übernimmt nichts automatisch.
- Daten, die vor dem Ausschalten gespeichert wurden, bleiben in der Datenbank. Schaltet man
  wieder ein, ist die Kachel sofort gefüllt, bis der nächste Lauf sie erneuert.
- Das Menü „Kachel ausblenden“ aus ADR-034 entfällt, ebenso `?kacheln=alle`. Wer die
  Kachel einschaltet, will sie sehen; abgeschaltet wird mit `"top25": false`. Ein alter
  Eintrag `portfolio.kacheln-ausgeblendet` im localStorage wird nicht mehr gelesen.
- Demo, Randfallseite, e2e und Tests setzen `top25: true` in ihrer eigenen Konfiguration;
  der Randfall `top25-aus` zeigt die Seite ohne Kachel.
