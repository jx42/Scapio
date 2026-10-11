# ADR-036: Kennzahlen-Korrekturen nach der Prüfung vom Oktober 2026

## Kontext

Die Prüfung aller Kennzahlen vom 2. Oktober 2026 (eine Arbeitsnotiz, nicht im Repository) fand zwei Fehler,
die Zahlen verfälschen, und mehrere Stellen, an denen Rechnung und Erklärtext auseinanderlaufen.
Diese ADR hält fest, wie gerechnet wird, wo es mehrere vertretbare Wege gab.

## Entscheidung

1. **Unverpaarter Depotübertrag.** Ein `TRANSFER_IN`/`TRANSFER_OUT` mit Menge, das keinen
   Gegenpart findet, ist ein externer Fluss in Höhe seines Betrags (Wertpapiere von außen
   herein oder nach außen hinaus). Die Stücke zählen in der Mengenreihe, der Betrag zählt
   nicht zusätzlich als Cash (`istWertpapieruebertrag`). Vorher stand der Wert doppelt im
   Depot: einmal als Stücke, einmal als Guthaben. FIFO führt den Eingang als Tranche zum
   Übertragswert, den Ausgang als Abgang zum Übertragswert.
2. **Paarung höchstens 30 Tage auseinander, nur gültige Buchungen.** Ein Übertrag, der
   storniert oder nicht ausgeführt ist, paart nicht; zwei Buchungen, die mehr als
   `PAAR_HOECHSTENS_TAGE` auseinanderliegen, gelten als zwei echte Vorgänge.
3. **TWR über mehrtägige Perioden mit Modified Dietz.** Wo zwischen zwei Bewertungstagen
   mehrere Tage liegen (Monatsraster, Lücken), wird jeder Fluss mit dem Anteil der Periode
   gewichtet, den er im Depot war. Bei Tagesperioden ist das Gewicht 1 und die Rechnung
   unverändert.
4. **Sparrate bis heute.** Die Monate laufen von der ersten Zahlung bis zum heutigen Monat,
   nicht bis zur letzten Zahlung; Monate ohne Zahlung zählen mit null.
5. **Positions-IZF mit Ausschüttungen.** Erträge mit derselben ISIN fließen in den IZF der
   Position ein; Steuern nicht, weil sie sich keiner Position verlässlich zurechnen lassen.
6. **Gebühren als eigene Kennzahl.** `FEE`-Buchungen werden summiert und als Liste
   ausgeliefert. Kaufkosten bleiben im Einstand.
7. **Realrendite exakt.** Angezeigt wird der IZF über die mit dem VPI deflationierten
   Zahlungen. Die Fisher-Gleichung mit der Durchschnittsteuerung bleibt nur Ersatz, wenn jener
   scheitert, und die Oberfläche sagt das dazu. Bei einem Sparplan verzerrt die Fisher-Gleichung
   zugunsten früher Jahre, weil sie unterstellt, das ganze Kapital sei von Anfang an angelegt.
8. **„Eingezahltes Kapital“ statt „Netto-Einzahlung“** in der Oberfläche, damit der Begriff
   neben „Investiertes Kapital“ (Einstand) als Paar lesbar ist. Code-Namen bleiben.

## Verworfene Alternativen

- **Unverpaarten Übertrag als Kauf/Verkauf behandeln.** Dann müsste der Gegenwert vom
  Verrechnungskonto kommen, das ihn nie gesehen hat; Cash würde negativ.
- **Pro Lücke tägliche Bewertung erzwingen.** Für Zeiträume ohne Tageskurse gibt es keine
  Tageswerte; Modified Dietz ist die übliche Näherung dafür.

## Folgen

- `KERN_VERSION` 32: die Historie wird beim nächsten Lauf neu berechnet.
- Ein unverpaarter Übertrag mit Betrag 0 wäre ein Zugang ohne Wert und hebt die Rendite.
  In echten Daten nicht beobachtet; falls er auftritt, braucht er einen Kurs vom Übertragstag.
  Nachgetragen in [ADR-043](ADR-043-flusskonvention-und-kapitalmassnahmen.md): der Ausgang
  wird zum Kurs bewertet, der Eingang gemeldet.
- Die Sharpe-Einordnung richtet sich nach realistischen Werten (breiter Welt-ETF ≈ 0,3–0,6),
  nicht mehr nach der Lehrbuchskala bis 2.
