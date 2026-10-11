# ADR-015: Die Summenprobe vergleicht nur, wenn beide Seiten denselben Moment beschreiben

> Der Gesamtwert kommt seit [ADR-032](ADR-032-gesamtwert-aus-portfolio-overview.md) aus
> `get_portfolio_overview` (`valuationTimestampUtc` statt `lastUpdatedAt`); die Regel gilt unverändert.

## Kontext

Zeile 4 der Prüfliste aus §6.4 ist die Selbstkontrolle (§7.7) des Ingest gegen die Bank: die Summe
der eigenen Positionswerte plus Kontostand muss dem Gesamtwert entsprechen, den die Bank
meldet. Weicht sie um mehr als 1 € ab, entsteht ein Hinweis, der in `lauf.hinweise_json`
landet und in der Oberfläche über allen Kacheln steht.

Die beiden Seiten des Vergleichs stammen aus zwei verschiedenen MCP-Tools und gelten zu
zwei verschiedenen Zeitpunkten:

- **Eigene Summe.** `get_portfolio_holdings` liefert je Position `currentQuote.midPrice`
  mit eigenem `timestamp` — ein Live-Kurs, Sekunden alt.
- **Gesamtwert der Bank.** `get_portfolio_performance` liefert die Gruppe `PRODUCT_TYPE`
  mit `lastUpdatedAt`. Die Bank rechnet diese Aufteilung nicht laufend neu, sondern
  gelegentlich; beobachtet wurde ein Stand pro Tag, nach Börsenschluss.

Damit vergleicht die Zeile während des Handelstages zwangsläufig zwei verschiedene
Momente. Beobachtung an einem Montag im September 2026, sechsstelliger Depotwert,
`lastUpdatedAt` vom Freitagabend davor:

| Lauf | Abweichung eigene Summe gegen Bank |
|---|---|
| Mo. 10:21 | −0,03 % |
| Mo. 10:20 | −0,03 % |
| Mo. 10:02 | −0,02 % |
| So. 19:22 | **0** |
| Sa. 19:49 | **0** |

Am Wochenende, als die Live-Kurse noch der Freitagsschluss waren, stimmten beide Seiten auf
den Cent. Sobald der Handel läuft, wandert die eigene Seite und die Bank steht still; die
Abweichung ist dann nichts anderes als der Kursgang seit dem Stand der Bank — hier 0,03 %.

Die Toleranz von 1 € ist bei einem sechsstelligen Depot ein Tausendstel Prozent oder
weniger. Jede normale
Kursbewegung reißt sie. Der Hinweis stand damit an jedem Handelstag, sagte nichts, und ein
Warnhinweis, der immer steht, wird nicht mehr gelesen — er hätte den Tag verdeckt, an dem
tatsächlich eine Position fehlt.

## Entscheidung

**Die Zeile vergleicht nur, wenn kein Kurs jünger ist als der Stand der Bank.**
`holeHoldings` gibt den jüngsten `currentQuote.timestamp` als `kurseAus` zurück,
`holePerformance` gibt `lastUpdatedAt` als `gesamtAus` zurück, und `pruefeSummen` schweigt,
wenn `kurseAus > gesamtAus`. Genau dann kann die Zeile nichts prüfen: die eigene Seite
kennt Kurse, die in den Gesamtwert der Bank noch nicht eingeflossen sind.

Die Toleranz von 1 € bleibt, wie sie ist. Auf dem vergleichbaren Pfad ist die beobachtete
Abweichung exakt null; die Grenze muss dort keine Kursbewegung auffangen, sondern soll
klein bleiben, damit die Zeile findet, wofür es sie gibt: eine fehlende Position, einen
nicht mitgezählten Kontostand, eine doppelte Buchung.

Fehlt einer der beiden Zeitstempel oder ist er nicht lesbar, wird **verglichen**, nicht
geschwiegen. Eine Selbstkontrolle, die sich bei jeder Unklarheit selbst abschaltet,
kontrolliert nichts mehr.

## Verworfene Alternativen

- **Relative Toleranz statt absoluter.** Naheliegend, aber sie hätte genau den Fall
  verdeckt, für den die Zeile gedacht ist: ein Kontostand im niedrigen dreistelligen Bereich ist bei einem sechsstelligen Depot
  weniger als ein Promille.
  Eine Toleranz, die die tägliche Kursbewegung von 0,03 % schluckt, liegt in derselben
  Größenordnung wie ein komplett fehlender Kontostand.
- **Ein Zeitfenster in beide Richtungen** („beide Stände höchstens 15 Minuten auseinander").
  Scheitert an den Daten: am Sonntag lagen die Stände fast einen Tag auseinander und
  stimmten trotzdem auf den Cent, weil beide auf demselben Freitagsschluss beruhten. Der
  Abstand ist nicht das Kriterium, die Richtung ist es.
- **Die Zeile ganz streichen.** Sie ist neben dem Drift-Banner die einzige Stelle, an der
  die Bank der eigenen Rechnung widerspricht. Sie soll seltener sprechen, nicht nie.
- **Den Gesamtwert der Bank zurückrechnen** — die Positionswerte auf den Kursstand von
  `lastUpdatedAt` zurücksetzen und dann vergleichen. Das hieße, für die Gegenprobe eine
  zweite Bewertung zu bauen, deren Fehler niemand bemerkt. Eine Gegenprobe, die selbst
  rechnet, prüft am Ende sich selbst.

## Folgen

- Der Hinweis erscheint an Handelstagen nicht mehr, solange die Bank ihren Stand nicht
  nachgezogen hat. Er erscheint weiterhin nach Börsenschluss und am Wochenende — also
  dann, wenn er etwas bedeutet.
- Erscheint er, ist er ein Befund und kein Rauschen: Zeitstempel und Kursgang scheiden als
  Erklärung aus. Der erste Griff bleibt `npm run verify`.
- `Holdingsernte` und `Performanceernte` tragen je ein Feld mehr. Gespeichert wird davon
  nichts — beide Zeitstempel leben nur innerhalb eines Laufs, die Rohantworten liegen
  ohnehin vollständig in `raw_snapshot`.
- `pruefeSummen` bleibt rein: beide Zeitpunkte kommen aus den Antworten, nicht von der Uhr.
