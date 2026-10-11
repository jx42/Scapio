# ADR-009: Risikokennzahlen auf Monatsbasis, mit echtem risikofreiem Zins

## Kontext

Kachel 3 zeigt Rendite (TWR, XIRR, Realrendite), aber keine einzige Risikokennzahl: wie
stark schwankt das Depot, wie tief war der schlimmste Einbruch, lohnt sich die Rendite im
Verhältnis zum eingegangenen Risiko. Drei Kennzahlen sollen das schließen — Volatilität
p.a., Max. Drawdown, Sharpe-Ratio —, jede mit mehreren plausiblen, nicht austauschbaren
Berechnungswegen. Diese ADR hält fest, welcher Weg gewählt wurde und warum.

## Entscheidung

**Basis ist der TWR-Index, nicht der rohe Depotwert.** `core/twr.ts` führt bereits einen
um Ein- und Auszahlungen bereinigten Index über die gesamte Historie. Eine Rechnung auf dem
rohen Depotwert würde eine große Einzahlung wie einen Kurssprung behandeln und die
Volatilität systematisch überzeichnen — derselbe Grund, aus dem TWR selbst auf diesem Index
statt auf `gesamtCent` rechnet.

**Monatsrenditen, nicht Tagesrenditen.** Der TWR-Index läuft vor 08/2025 auf Monatsraster,
danach auf echten Tageskursen (`GROB_AB_TAGEN` in `twr.ts`). Tagesrenditen wären deshalb nur
für die feine Historie sauber berechenbar und müssten die grobe Historie entweder ausklammern
oder mit einer künstlichen Fortschreibung auffüllen — beides verzerrt das Bild. Der Index hat
dagegen für jeden Kalendertag einen Eintrag (auch in der groben Ära, mit fortgeführtem Wert),
sodass `monatsrenditen()` den letzten Indexwert je Kalendermonat einheitlich über die gesamte
Historie ziehen kann, ohne einen Sonderfall für die Übergangsgrenze.

**Risikofreier Zins: echte €STR-Reihe von der EZB, nicht 0 % angenommen.** Ein
Nullzins-Sharpe wäre in Hochzinsjahren zu optimistisch und in Nullzinsjahren zufällig richtig
— eine falsche Kennzahl ist hier schlechter als eine fehlende. `ingest/quellen/zins.ts` holt
deshalb den Euro Short-Term Rate von `data-api.ecb.europa.eu`, öffentlich und ohne
Zugangsdaten, täglich statt monatlich wie VPI, weil der €STR täglich publiziert wird. Steht
`zinsquelle` auf `'keine'` oder schlägt der Abruf fehl, läuft das Dashboard ohne Sharpe-Ratio
weiter (`SharpeErgebnis['art'] === 'kein_zins'`) — genau wie es ohne Inflationsdaten ohne
Realrendite weiterläuft.

**Sharpe zählt nur Monate mit echtem €STR-Durchschnitt.** Für einen Monat geht nur die
Überschussrendite ein, wenn `zinsreihe` für diesen Kalendermonat mindestens einen Tageswert
liefert; ohne Treffer fällt der Monat komplett aus der Rechnung (und zählt gegen
`MIN_MONATE`), statt ihn mit dem letzten bekannten Zins fortzuschreiben. VPI schreibt fehlende
Monate fort, weil ein Verbraucherpreisindex sich träge bewegt; ein Tageszins tut das nicht,
und eine zweite Fortschreib-Mechanik nur für diese eine Kennzahl wäre unverhältnismäßig.

**Max. Drawdown braucht keine Monats-Schwelle.** Er läuft auf der vollen Auflösung des
Index (nicht auf Monatsrenditen) und ist ab zwei Indexpunkten wohldefiniert — ein Einbruch
innerhalb eines Monats soll sichtbar bleiben, nicht durch die Monatsverdichtung verschluckt
werden. Volatilität und Sharpe verlangen dagegen `MIN_MONATE = 12` Monatsrenditen (also
mindestens 13 Monate Historie), weil eine Standardabweichung aus wenigen Monaten kaum mehr
als Rauschen misst.

**Stichproben-Standardabweichung (n-1), nicht Populationsstandardabweichung (n).** Die
Monatsrenditen sind eine Stichprobe aus der tatsächlichen, unbeobachtbaren Renditeverteilung
des Depots, nicht die vollständige Grundgesamtheit — der Bessel-korrigierte Schätzer ist hier
der Standard in der Finanzliteratur und vermeidet eine systematische Unterschätzung der
Streuung bei kurzen Reihen.

**Sharpe-Zähler: arithmetisches Mittel der monatlichen Überschussrendite × 12, nicht
geometrische Verkettung.** Das ist die Standard-Sharpe-Formel (Sharpe 1966/1994) und bewusst
unabhängig von TWRs eigener Annualisierung, die unter einem Jahr `null` liefert
(`twrProJahr`) — Sharpe braucht dagegen ab `MIN_MONATE` einen Wert, auch knapp über einem
Jahr.

## Folgen

- Ein Depot mit weniger als 13 Monaten Historie zeigt Volatilität und Sharpe gar nicht
  (die Oberfläche blendet nicht berechenbare Risikokennzahlen aus), aber bereits einen
  Max. Drawdown ab dem zweiten Kurstag.
- Fällt der EZB-Abruf aus oder ist `zinsquelle: 'keine'` gesetzt, bleibt Sharpe dauerhaft
  `kein_zins`, bis die Quelle wieder erfolgreich läuft — kein automatischer Rückfall auf 0 %.
- Eine konstante Monatsrendite (Volatilität exakt 0) ergibt für Sharpe `keine_streuung`
  statt einer Division durch 0 — in der Praxis nahezu nie erreicht, weil echte Indexwerte
  aus verschiedenen Tagesrechnungen stammen und Gleitkomma-Rauschen die Streuung fast immer
  von exakt 0 wegdrückt; der Zweig existiert als Absicherung, nicht als erwarteter Regelfall.
- Ein Rechenkern-Modul (`core/risiko.ts`) bekommt eine neue Abhängigkeit von außen — der
  Zinsreihe als `ReadonlyMap<Tag, number>` —, bleibt dabei aber rein: keine eigene Uhr, kein
  eigener Netzzugriff, die Reihe kommt vollständig von außen wie `TwrErgebnis.index`.
