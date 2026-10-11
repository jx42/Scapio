# ADR-017: Zwei Eurostat-Datensätze bilden eine Preisreihe

## Kontext

[ADR-003](ADR-003-eurostat-statt-destatis.md) hat Eurostat als Quelle des
Verbraucherpreisindex festgelegt, Datensatz `prc_hicp_midx` (Index 2015 = 100). Diese
Entscheidung steht; sie ist nicht Gegenstand dieser ADR.

Beobachtung am 7. September 2026:

| Datensatz | zuletzt aktualisiert | letzter Monat |
|---|---|---|
| `prc_hicp_midx` | 2026-02-06 | **2025-12** |
| `ei_cphi_m` | 2026-09-01 | **2026-08** |

Der angebundene Datensatz stand seit sieben Monaten still — für `geo=DE` ebenso wie für
`EA` und `EU27_2020`, es war also kein Deutschland-Problem, sondern der Datensatz selbst.
Damit lag kein einziger Monat des Jahres 2026 in der Datenbank.

Ein fehlender Monat ist in `core/inflation.ts` kein Loch, sondern eine Annahme:

- `deflationiere` schreibt den letzten bekannten Index fort — für die acht fehlenden
  Monate hieß das **null Prozent Inflation**.
- `teuerungProJahr` endet bewusst am letzten Monat mit echter Zahl, damit ein
  fortgeschriebener Wert den Durchschnitt nicht verwässert — die acht Monate fehlten also
  auch in der Fisher-Näherung.

Beides zieht in dieselbe Richtung: die ausgewiesene Realrendite war zu günstig. Ein
Dashboard, dessen einzige Antwort auf „habe ich Kaufkraft gewonnen?" systematisch zu
optimistisch ausfällt, ist an seiner wichtigsten Stelle falsch.

Der Kurzfrist-Datensatz `ei_cphi_m` liegt auf demselben Host, an derselben öffentlichen
REST-Schnittstelle, weiterhin ohne Zugangsdaten — er kostet weder einen neuen Host in der
Allowlist noch ein Token. Er hat aber eine andere Basis (2025 = 100 statt 2015 = 100) und
reicht nicht weit genug zurück, um die lange Reihe zu ersetzen.

## Entscheidung

Die Preisreihe entsteht aus **zwei** Datensätzen: `prc_hicp_midx` liefert die Historie,
`ei_cphi_m` füllt den Rand.

1. `ingest/quellen/vpi.ts` schreibt zuerst und unverändert. Es bleibt die amtliche Reihe.
2. `ingest/quellen/vpiAktuell.ts` läuft danach, bekommt deren Ergebnis übergeben und gibt
   **nur Monate nach dem letzten amtlichen** zurück. Holt `prc_hicp_midx` eines Tages auf,
   verschwindet der nachgefüllte Rand von allein wieder aus der Datenbank.
3. Der Umrechnungsfaktor auf die Basis 2015 = 100 ist der **Median** der monatlichen
   Quotienten `I15 ÷ HICP2025` über die gemeinsamen Monate — der Median und nicht der
   Mittelwert, damit ein einzelner revidierter Monat ihn nicht zieht.
4. `vpi.quelle` unterscheidet die Herkunft: `eurostat:prc_hicp_midx` gegen
   `eurostat:ei_cphi_m`. Die Spalte ist genau dafür ein Textfeld — so hat ADR-003 sie
   angelegt. **Keine Migration.**

Die Umbasierung sitzt im **Ingest**, nicht im Rechenkern. `core/` sieht wie bisher genau
eine Indexreihe auf einer Basis und weiß nichts von zwei Datensätzen. Das ist der Grund,
warum diese Änderung an `core/inflation.ts` keine Zeile kostet: `teuerungProJahr` läuft von
allein bis zum neuen Rand, `deflationiere` hört von allein auf fortzuschreiben. Umgekehrt
wäre die Umbasierung im Rechenkern eine Herkunftsfrage — und Herkunft ist nicht die Frage,
die `core/` beantwortet.

## Verworfene Alternative: einen Durchschnittswert einsetzen

Naheliegend wäre gewesen, statt der Monatswerte die veröffentlichte Jahresteuerung
(`unit=RT12`) zu holen und einzusetzen. Dagegen sprach:

- Die exakte Deflationierung braucht pro Zahlungsfluss einen **Monatsindex**; mit einer
  Jahreszahl kann sie nichts anfangen.
- `core/` bekäme einen zweiten Inflationsbegriff neben dem Index — zwei Wege zur selben
  Zahl, die auseinanderlaufen können.
- Derselbe Netzabruf liefert die Monatswerte ohnehin mit. Sie tragen mehr Information und
  kosten nichts extra.

Der Durchschnitt des laufenden Jahres wird trotzdem gezeigt — aber als Einordnung neben
„Ø Inflation p.a.", nicht als Rechengröße (`teuerungLaufendesJahr` in `core/inflation.ts`).
Er beantwortet „wie hoch ist die Inflation *gerade*", während die Ø Inflation p.a. über die
gesamte Anlagedauer mittelt.

## Zwei Wächter gegen eine verschobene Reihe

Eine um einen Faktor verschobene Preisreihe wäre in der Oberfläche **nicht zu sehen** —
sie sähe aus wie eine plausible Zahl. Deshalb wird geprüft statt geraten, an zwei
unabhängigen Stellen:

- **In der Quelle**, an der Naht: mindestens 6 gemeinsame Monate, und die Quotienten dürfen
  um höchstens 0,5 % streuen. Gemessen waren es 24 Monate mit 0,08 ‰ Streuung — die
  Schwelle schlägt also erst an, wenn die Reihen methodisch nicht mehr zueinander passen.
  Reißt sie, **scheitert die Quelle**.
- **In der Plausibilität**, an der fertigen Reihe: ein Monatssprung über 3 % ergibt einen
  Hinweis (`pruefeVpiReihe`). Dieser Wächter sieht die Reihe so, wie sie in die Datenbank
  geht, und fällt auch dann auf, wenn die Naht ganz woanders entstanden ist.

## Folgen

- Die ausgewiesene Realrendite **sinkt** — um genau den Betrag, um den sie vorher zu
  günstig war. Das ist der Zweck der Änderung, kein Nebeneffekt.
- Scheitert `vpi-aktuell`, ist das ein Hinweis und kein Fehler des Laufs: das Dashboard
  steht dann auf dem Stand der amtlichen Reihe, also da, wo es ohne diese Quelle stünde.
- `fortgeschriebeneMonate` schrumpft auf höchstens einen Monat — den laufenden, für den
  noch keine Statistik existiert. Der Hinweis „für das laufende Jahr liegt noch keine Zahl
  vor" greift ab jetzt nur noch dort, wo er stimmt.
- Es kommt kein Host, kein Token und keine Migration hinzu. Destatis bleibt unangetastet
  der übersprungene Zweig.
