# ADR-043: Flusskonvention, Kapitalmaßnahmen und Randfälle im Rechenkern

Nachtrag zu [ADR-036](ADR-036-kennzahlen-korrekturen-nach-pruefung.md), aus dem Audit vom 2026-10-07
(eine Arbeitsnotiz, nicht im Repository).

## Kontext

Das Audit hat den Kern unabhängig nachgerechnet. Normale Depots stimmen, an den Rändern
weichen die Ergebnisse ab:

- Die TWR zählte jeden Fluss zum Tagesbeginn. Bei einer großen Entnahme am selben Tag
  wurde die Tagesrendite auf den kleinen Rest bezogen. Bei einer Auflösung entstand
  `basis <= 0`, und die Rechnung lief trotzdem weiter.
- FIFO kannte keine Kapitalmaßnahmen. Ein Split, eine Zusammenlegung oder ein ISIN-Wechsel
  mit Betrag 0 wurde als Kauf zu 0 und Verkauf zu 0 gebucht. Der Einstand ging verloren,
  und der realisierte Gewinn stimmte nicht.
- Ein unverpaarter Übertrag mit Betrag 0 war beim Ausgang ein Totalverlust und beim
  Eingang ein Zugang ohne Kosten (ADR-036, Folgen).
- XIRR meldete 10 %, wenn alle Flüsse auf einen Tag fielen. Bei mehreren Lösungen gab er
  still eine davon aus, und eine Lösung jenseits von 1.000 % hieß `nicht_konvergiert`.
- Vola und Sharpe zählten den laufenden Teilmonat als vollen Monat.
- `teuerungProJahr` rechnete die Jahre ab dem ersten Fluss, auch wenn die VPI-Reihe erst
  später begann.

## Entscheidung

- **TWR: Zufluss zum Tagesbeginn, Abfluss zum Tagesende.** Gerechnet wird
  `r = (V − CF) / (V_vor + Zufluss) − 1`; Modified Dietz gewichtet entsprechend. Bei
  `basis <= 0` wird die Teilperiode übersprungen und das Ergebnis als `grob` markiert.
  Ein leeres Depot ohne Fluss wird still übersprungen.
- **Kapitalmaßnahmen in FIFO.** Eine Bewegung mit Betrag 0, die kein Wertpapierübertrag
  ist, gilt als Kapitalmaßnahme und wird vor dem Handel des Tages gebucht, saldiert je ISIN:
  - Bleibt Bestand übrig (Split, Zusammenlegung, Gratisstücke), wird die Menge neu auf
    die Tranchen verteilt. Die Kosten bleiben gleich.
  - Geht der ganze Bestand ab, wandert der Einstand in einen Topf.
  - Ein Zugang ohne Bestand übernimmt den Topf; bei mehreren Zugängen anteilig nach Menge.
  - Was nach `PAAR_HOECHSTENS_TAGE` noch im Topf liegt, wird als realisierter Verlust
    gebucht. *Abgelöst durch [ADR-053](ADR-053-stichtag-und-isin-wechsel-im-kern.md): nur
    Zugänge desselben Tags, sonst sofort Verlust.*

  Erkannt wird das generisch, ohne Wissen über Bank oder Buchungstyp.
- **Unverpaarter Übertrag ohne Wert.** Der Ausgang wird zum letzten Kurs bis zu seinem Tag
  bewertet und zählt damit als Entnahme zum Tageswert (`bewerteAusgaenge`; dieselbe
  Rechnung in Depotreihe und Lesemodell). Den Eingang schätzt Scapio nicht, sondern
  meldet ihn als Lauf-Hinweis `uebertragOhneWert`.
- **XIRR:**
  - Liegen alle Flüsse am selben Tag, heißt das Ergebnis `nicht_bestimmbar`.
  - Scheitert die Bisektion an den Grenzen, heißt es `ausserhalb_bereich`.
  - Bei mehreren Vorzeichenwechseln trägt ein `ok` das Flag `mehrdeutig`. Es fehlt, wenn
    die kumulierte Summe nur einmal wechselt (Norström) und die Lösung über 0 % liegt: ein
    Sparplan mit gelegentlicher Entnahme und Gewinn bleibt eindeutig. Die Oberfläche zeigt
    bei `mehrdeutig` einen Satz. *Präzisiert im Nachtrag `KERN_VERSION` 47.*
- **Risiko:** `monatsrenditen` lässt den Monat des Stichtags (ADR-053) weg, solange er nicht vorbei ist.
- **Teuerung:** Gerechnet wird ab max(erster Fluss, ältester VPI-Monat).
- **IZF unter einem Jahr** bleibt annualisiert. Die Erklärtexte sagen das jetzt, ebenso
  bei der Realrendite und der TWR p. a.

## Verworfene Alternativen

- **Alle Flüsse am Tagesende.** Dann wäre eine Einzahlung mit Kauf am selben Tag in der
  Tagesrendite ein Kursgewinn.
- **Kapitalmaßnahmen über eine Liste von Buchungstypen erkennen.** Die Typen der Bank sind
  nicht dokumentiert. Betrag 0 ohne Übertrag ist das einzige Merkmal, das ohne Bankdaten
  feststeht.
- **Den Eingang ohne Wert zum Kurs bewerten.** Er wäre dann eine Einzahlung, die nie
  überwiesen wurde, und hätte einen geschätzten Einstand. Lieber eine zu hohe Rendite mit
  Hinweis als eine stille Schätzung.
- **IZF unter 365 Tagen nicht annualisieren.** Das ist eine Änderung der Kennzahl, kein
  Randfall. Der Text reicht.

## Folgen

- `KERN_VERSION` 33: Die Historie wird beim nächsten Lauf neu berechnet. `npm run verify`
  zeigt einmalig Abweichungen an Tagen mit Entnahme, Auflösung oder Kapitalmaßnahme. Die
  sind gewollt.
- Offen ist, wie die Bank einen ISIN-Wechsel bucht. Kommt er als `TRANSFER_OUT`/`TRANSFER_IN`
  mit Betrag 0 und zwei verschiedenen ISINs, wird der Ausgang bewertet und der Eingang nur
  gemeldet. Die Rendite stimmt dann nicht, ist aber sichtbar markiert.
- Ein Zugang mit Betrag 0 in eine schon gehaltene ISIN, während der Topf voll ist, gilt als
  Split. Der Topf verfällt dann nach 30 Tagen als Verlust. *Seit ADR-053 noch am selben Tag.*
- **Nachtrag [ADR-053](ADR-053-stichtag-und-isin-wechsel-im-kern.md):** Endwert auf dem letzten
  Reihentag statt `heute`; Positions-IZF nimmt die Flüsse der Vorgänger-ISIN auf.
- `ausserhalb_bereich` deckt bei mehreren Vorzeichenwechseln auch Reihen ohne jede reelle
  Lösung ab. *Eine gerade Zahl von Lösungen im Bereich heißt seit `KERN_VERSION` 47
  `nicht_eindeutig`.*
- Der tote Code `durchschnittlicheSparrate` ist entfernt; die Sparrate kommt aus `monatsFluesse`. In
  Fixture F0 wird ZZ0000000003 jetzt vor dem Verkauf gekauft.
- **Nachtrag (`KERN_VERSION` 46): eine Überverkaufsregel.** Verkauft eine Buchung mehr, als
  bekannt ist, ist der Bestand danach null. Das gilt in `fifo()` und in der Mengenreihe
  gleichermaßen. Der Erlös über dem bekannten Einstand zählt ganz als realisierter Gewinn, und
  die Kennzahlen melden `H_UEBERVERKAUF`. Vorher bilanzierte FIFO nur den anteiligen Erlös,
  während die Mengenreihe negativ weiterlief. So stand eine negative Position im Depotwert,
  und die Sankey lief am Gesamtgewinn vorbei. Innerhalb eines Tages gehen Zugänge vor Abgängen,
  unabhängig vom Zeitstempel: Ein Verkauf mit früherem `ts` als der Kauf desselben Tages ist
  sonst ein Überverkauf. Kapitalmaßnahmen wirken weiter zum Tagesbeginn.

## Nachtrag (`KERN_VERSION` 47): Norström nur über null, Zustand `nicht_eindeutig`

- Norström sichert nur die Lösung über 0 %. Unter null kann daneben eine zweite liegen
  (Probe −1000/+2500/−1000: −50 % und +100 %). `mehrdeutig` fehlt deshalb nur, wenn die
  kumulierte Summe einmal wechselt, die Lösung über 0 % liegt und ein Raster in ln(1+r)
  (`RASTER_PUNKTE`) unter null keinen Vorzeichenwechsel des Barwerts findet.
- Sieht die Bisektion an beiden Grenzen dasselbe Vorzeichen, findet dasselbe Raster aber
  einen Wechsel, liegen im Bereich mindestens zwei Lösungen: `nicht_eindeutig` statt
  `ausserhalb_bereich`. Ohne Wechsel im Raster bleibt es `ausserhalb_bereich`. Zwei sehr
  nahe Nullstellen fallen durch das Raster; dann bleibt es beim alten Satz.
- `xirr()` nimmt keinen ungenutzten Tag mehr entgegen.
