# ADR-027: iShares-Bestandteile per `get-product-data`

## Kontext

iShares hat die deutsche Seite umgebaut. Die `.ajax?tab=all&fileType=json`-Adressen und der
Produktscreener (`product-screener-v3.jsn`) liefern 404; die iShares-ETFs blieben ohne
Bestandteile, die Kachel „Top 25" zeigte sie als fehlend. CSV-, XLS- und `component=holdings`-
Downloads gibt es weiter, sie enthalten aber nur den Ticker, keine ISIN — für den Look-Through
([ADR-018](ADR-018-fondskataloge-statt-einzelabfrage.md)) unbrauchbar.

## Entscheidung

Die Bestandteile kommen aus `www.ishares.com/varnish-api/…/get-product-data`
(`component=holdings.all`, `portfolioId=<Produkt-ID>`), dem Aufruf, den die neue Produktseite
selbst macht. Kein Cookie, kein Header, kein `asOfDate` nötig (ohne liefert die API den
jüngsten Stand). Die Antwort ist spaltenweise (parallele Arrays); `IsharesAntwort` prüft die
fünf gelesenen Spalten, `holeIshares` die gleiche Länge. Der Host ist derselbe wie zuvor,
die Allowlist bleibt unverändert.

- `funds.json` trägt bei iShares `produktId` statt `adresse`.
- Der Katalog (ISIN → Produkt-ID) entfällt ersatzlos: der neue Screener liefert ohne
  Browser-Sitzung keine Daten. iShares hat deshalb `katalog: null`; die Quelle
  `fondskatalog:ishares` gilt als übersprungen, nicht als gescheitert, und `aufloese` behält
  die bekannte Zeile. `fonds_aufloesung.adresse` speichert jetzt die Produkt-ID.

## Folgen

- Bereits erkannte iShares-Fonds laufen weiter; neue iShares-Fonds müssen einmal mit ihrer
  Produkt-ID in `funds.json` eingetragen werden (die Fehlende-Fonds-Liste bietet den Baustein).
- Die API ist undokumentiert. Ändert iShares sie, schlägt der Abruf am Schema fehl, der letzte
  Stand bleibt stehen.
