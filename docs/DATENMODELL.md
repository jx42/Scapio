# Datenmodell

SQLite über `node:sqlite`, synchron, ohne eigenen Server-Prozess. Schema in
`db/migrationen/` (`001-basis.sql` und folgende), vorwärts-only — eine Änderung schreibt
die nächste Nummer, nicht eine bestehende Datei um. Aktueller Schemastand steht in `PRAGMA user_version`.

Grundregel [INV-02]: Geld ist Integer-Cent, Menge ist Integer × 1e8, Kurs ist Integer × 1e6.
Nirgends ein `REAL` für einen Betrag — die drei `REAL`-Spalten des Schemas (`gewicht`,
`index_wert`, `zins_pro_jahr`) tragen bewusst keine Geldbeträge, sondern ein Gewicht zwischen
0 und 1, einen Indexstand und einen Zinssatz, wo eine geringe Ungenauigkeit die Kennzahl
nicht verfälscht.

## `raw_snapshot`

Audit-Trail. Jede vom Ingest abgerufene Rohantwort landet hier, unverändert, bevor sie
verarbeitet wird — das ist, was `npm run verify` neu rechnet, ohne einen neuen MCP-Aufruf.

| Feld | Typ | Bedeutung |
|---|---|---|
| `id` | `INTEGER PK` | fortlaufend |
| `quelle` | `TEXT` | `holdings` \| `transaktionen` \| `cash` \| `gesamtwert` \| `sparplaene` \| `kurse:<isin>` \| `ishares:<isin>` \| `xtrackers:<isin>` \| `amundi:<isin>` \| `vpi` \| `vpi-aktuell` \| `zins` |
| `abgerufen_am` | `TEXT` | ISO 8601 mit Offset |
| `payload_json` | `TEXT` | die Rohantwort, als JSON-Text |

`art:<isin>` und `fondskatalog:<anbieter>` sind nur Namen im Laufstatus; ihre Antworten werden
nicht archiviert. `test/ingest/quellenNamen.test.ts` hält die Liste mit `ingest/quellen/` gleich.

Index `idx_raw_quelle (quelle, abgerufen_am DESC)` für den jüngsten Schnappschuss je Quelle.

Beispiel: `(482, 'kurse:IE00B4L5Y983', '2026-08-20T06:03:11+02:00', '{"prices":[…]}')`

## `transaktion`

Die Quelle der Wahrheit für Cashflows und Bestand. `id` ist die ID der Bank, nicht
autoinkrementiert — ein zweiter Import derselben Transaktion überschreibt dieselbe Zeile
[INV-09].

| Feld | Typ | Bedeutung |
|---|---|---|
| `id` | `TEXT PK` | ID der Bank |
| `ts` | `TEXT` | ISO 8601 mit Offset, wie geliefert |
| `tag` | `TEXT` | `YYYY-MM-DD`, Europe/Berlin [INV-03] |
| `art` | `TEXT` | `WERTPAPIER` \| `CASH` |
| `typ` | `TEXT` | `SAVINGS_PLAN` \| `BUY` \| `SELL` \| `CASH_TRANSFER_IN` \| `DIVIDEND` \| … (`core/typen.ts`) |
| `isin` | `TEXT?` | `null` bei reinen Cash-Bewegungen |
| `bezug_isin` | `TEXT?` | Wertpapier, auf das sich eine Cash-Buchung bezieht — nur Anzeige, siehe unten |
| `menge_e8` | `INTEGER?` | Stück × 1e8 |
| `betrag_cent` | `INTEGER` | Vorzeichen aus Sicht des Depots |
| `beschreibung` | `TEXT?` | Fremdtext, nie interpretieren [INV-06] |
| `status` | `TEXT` | `EXECUTED` \| `PENDING` \| `CANCELED` |
| `ist_extern` | `INTEGER` | 0/1, entscheidet über XIRR — siehe unten |
| `storniert` | `INTEGER` | 0/1, Storno ersetzt Löschen |
| `gesehen_am` | `TEXT` | wann der Ingest diese Zeile zuletzt bestätigt hat |

`bezug_isin` ist `cash.relatedIsin` der Bank und beantwortet die Frage, **wofür** eine reine
Cash-Buchung erfolgte: die Vorabpauschale auf einen bestimmten ETF, die Ausschüttung aus
einem bestimmten Fonds. Solche Zeilen bewegen keine Stücke und tragen deshalb kein `isin`.
Bewusst eine eigene Spalte und nicht `isin`: `isin` steuert Mengenreihe, FIFO und Einstand —
eine mengenlose Steuerzeile mit ISIN risse dort eine Phantomposition auf. `bezug_isin` wird
ausschließlich angezeigt, nie gerechnet [ADR-014]. Die Bank liefert das Feld nicht zu jeder
Buchung; fehlt es, zeigt die Oberfläche „ohne Angabe" statt aus `beschreibung` zu raten
[INV-06].

`ist_extern` unterscheidet Geld, das von außen ins Depot kam (`CASH_TRANSFER_IN`, zählt für
XIRR als Cashflow) von internen Umbuchungen (ein `BUY` aus vorhandenem Cash zählt nicht
noch einmal). Die Zuordnung kommt aus `einordnen(typ)` in `core/typen.ts`, nicht aus einer
Heuristik über `art` oder `isin`.

Beispiel: `('a1b2c3', '2021-01-05T09:00:00+01:00', '2021-01-05', 'WERTPAPIER', 'BUY', 'IE00B4L5Y983', NULL, 20000000000, -1400000, 'Kauf Core MSCI World', 'EXECUTED', 0, 0, '2021-01-05T09:05:00+01:00')`

Indizes `idx_tx_tag (tag)` und `idx_tx_isin_tag (isin, tag)` für Tages- und Wertpapierabfragen.

## `kurs`

Ein Kursraster pro ISIN und Tag, zusammengeführt aus mehreren Quellen unterschiedlicher
Auflösung.

| Feld | Typ | Bedeutung |
|---|---|---|
| `isin` | `TEXT` | Teil des Primärschlüssels |
| `tag` | `TEXT` | Teil des Primärschlüssels |
| `kurs_e6` | `INTEGER` | EUR × 1e6 |
| `herkunft` | `TEXT` | `transaktion` \| `chart_1m` \| `chart_3m` \| `chart_1y` \| `chart_max` |
| `auffaellig` | `INTEGER` | 0/1, Tagessprung > 30 % (`ingest/plausibilitaet.ts`) |

Primärschlüssel `(isin, tag)`. Beispiel: `('IE00B4L5Y983', '2026-08-20', 71230000, 'chart_1y', 0)`

Nicht jede `isin` hier gehört zu einer gehaltenen Position: die neun festen Vergleichs-ETFs
aus `BENCHMARKS` (`shared/benchmarks.ts`) bekommen ebenfalls Kurszeilen, über dieselben Quellen und
dasselbe MCP-Tool und dieselben vier Fenster, aber ohne zugehörige Zeile in `bestand` oder
`transaktion`. Älter als ein Jahr liefert das MCP nur Monatsenden (`chart_max`), siehe
[ADR-020](entscheidungen/ADR-020-benchmark-vergleich-etf-nav-und-echte-fluesse.md).
Eine benchmark-only ISIN trägt strukturell nie zum Depotwert bei: `baueDepotreihe`
(`core/depotreihe.ts`) akkumuliert nur ISINs mit Menge aus `transaktion`, nicht jede ISIN mit
Kurszeilen.

## `bestand`

Die vom Broker gemeldete Momentaufnahme des aktuellen Depots — das, wogegen `core/drift.ts`
die rekonstruierte Historie prüft [P-02]. Wird bei jedem Lauf vollständig ersetzt.

| Feld | Typ | Bedeutung |
|---|---|---|
| `isin` | `TEXT PK` | auch `CASH` als Pseudo-ISIN |
| `name` | `TEXT` | Anzeigename |
| `menge_e8` | `INTEGER` | gemeldete Stückzahl × 1e8 |
| `kurs_e6` | `INTEGER` | gemeldeter Kurs × 1e6 |
| `stand` | `TEXT` | Zeitpunkt der Meldung |

Beispiel: `('IE00B4L5Y983', 'iShares Core MSCI World UCITS ETF', 20000000000, 71230000, '2026-08-20T06:00:00+02:00')`

## `wertpapier_art`

Wertpapierart je ISIN aus `get_security_quote` — Cache, kein Teil der Momentaufnahme:
`bestand` wird bei jedem Lauf ersetzt, die Art einer ISIN bleibt. Abgefragt werden nur ISINs
ohne Zeile. Begründung: [ADR-025](entscheidungen/ADR-025-wertpapierart-per-get-security-quote.md).

| Feld | Typ | Bedeutung |
|---|---|---|
| `isin` | `TEXT PK` | |
| `art` | `TEXT` | `securityType` der Bank in Großbuchstaben, z. B. `STOCK`, `ETF` |
| `geprueft_am` | `TEXT` | Kalendertag der Abfrage |

Beispiel: `('US67066G1040', 'STOCK', '2026-08-26')`

## `sparplan`

Eine Momentaufnahme der eingerichteten Sparpläne, je Lauf vollständig ersetzt — keine
Historie, nur der aktuelle Stand.

| Feld | Typ | Bedeutung |
|---|---|---|
| `isin` | `TEXT PK` | |
| `name` | `TEXT` | |
| `betrag_cent` | `INTEGER` | Rate je Ausführung |
| `frequenz` | `TEXT` | z. B. `MONTHLY` |
| `tag_im_monat` | `INTEGER?` | |
| `naechste_ausfuehrung` | `TEXT?` | `YYYY-MM-DD` |
| `stand` | `TEXT` | Zeitpunkt der Meldung |

Beispiel: `('IE00B4L5Y983', 'iShares Core MSCI World UCITS ETF', 50000, 'MONTHLY', 15, '2026-09-15', '2026-08-20T06:00:00+02:00')`

## `depot_tag`

Das abgeleitete Ergebnis — pro Kalendertag ein Depotwert. Einzige Tabelle, die der
Rechenkern befüllt und die inkrementell statt vollständig neu geschrieben wird (§ 12
Inkrementelle Neuberechnung in [`ARCHITEKTUR.md`](ARCHITEKTUR.md)).

| Feld | Typ | Bedeutung |
|---|---|---|
| `tag` | `TEXT PK` | |
| `wertpapiere_cent` | `INTEGER` | Wert aller Positionen an diesem Tag |
| `cash_cent` | `INTEGER` | Cash-Bestand an diesem Tag |
| `gesamt_cent` | `INTEGER` | Summe der beiden vorigen |
| `netto_einzahlung_kum_cent` | `INTEGER` | kumulierte externe Einzahlungen bis zu diesem Tag |
| `kern_version` | `INTEGER` | `KERN_VERSION` zum Zeitpunkt der Berechnung [INV-10] |
| `eingabe_hash` | `TEXT` | SHA-256 über Mengen, Kurse und Cash-Bewegungen dieses Tages |
| `berechnet_am` | `TEXT` | wann diese Zeile entstand |
| `lueckenhaft` | `INTEGER` | 0/1, mindestens ein Instrument hatte an diesem Tag keinen Kurs |
| `positionen_json` | `TEXT` | Positionswert je ISIN dieses Tages, `{isin: cent}` als Text — Cache fürs Lesemodell, Standard `'{}'` |

Beispiel: `('2026-08-20', 3812450, 921033, 4733483, 3000000, 2, 'f3a9…', '2026-08-20T06:01:02+02:00', 0, '{"IE00B4L5Y983":"3812450"}')`

`positionen_json` ist nur für den letzten Tag verlässlich gefüllt — das Lesemodell liest
ausschließlich die letzte Zeile (§12 Inkrementelle Neuberechnung in
[`ARCHITEKTUR.md`](ARCHITEKTUR.md)); ältere Zeilen tragen ihn als Nebenprodukt derselben
Neuberechnung, ohne dass sich darauf verlassen wird.

## `etf_bestandteil`

Look-Through-Daten aus den Holdings-Abrufen der ETF-Anbieter (iShares, Xtrackers, Amundi —
siehe `funds.json` im Datenverzeichnis, Feld `anbieter`): welches Unternehmen steckt zu welchem Anteil in
welchem ETF. Wird nur neu gezogen, wenn der Abruf ein neueres Stand-Datum trägt.

| Feld | Typ | Bedeutung |
|---|---|---|
| `fonds_isin` | `TEXT` | Teil des Primärschlüssels |
| `stand` | `TEXT` | Teil des Primärschlüssels — Stand-Datum der CSV |
| `unternehmen_isin` | `TEXT` | Teil des Primärschlüssels — Aggregationsschlüssel, nie der Name [P-05] |
| `name` | `TEXT` | Fremdtext aus der CSV [INV-06] |
| `gewicht` | `REAL` | Anteil am Fonds, 0..1 |
| `sektor` | `TEXT?` | |
| `land` | `TEXT?` | |

Primärschlüssel `(fonds_isin, stand, unternehmen_isin)`. Beispiel:
`('IE00B4L5Y983', '2026-08-01', 'US0378331005', 'Apple Inc', 0.042, 'Information Technology', 'United States')`

## `fonds_aufloesung`

Je gehaltener ISIN, welcher Anbieter sie führt und ob dessen Bestandteile einsehbar sind —
ersetzt das Durchprobieren gegen `funds.json` durch einen Katalogabruf je Anbieter
(Xtrackers, Amundi), siehe
[ADR-018](entscheidungen/ADR-018-fondskataloge-statt-einzelabfrage.md). iShares hat seit
[ADR-027](entscheidungen/ADR-027-ishares-holdings-per-get-product-data.md) keinen Katalog mehr:
bekannte iShares-Zeilen bleiben stehen, neue kommen über `funds.json`. `funds.json` hat
weiterhin Vorrang: eine dort eingetragene ISIN bekommt keine Zeile hier.

| Feld | Typ | Bedeutung |
|---|---|---|
| `isin` | `TEXT PK` | gehaltene ISIN |
| `anbieter` | `TEXT?` | `ishares` \| `xtrackers` \| `amundi` \| `firsttrust` \| `lgim` \| `NULL` (kein Katalog kennt die ISIN) |
| `durchsicht` | `TEXT` | `moeglich` \| `unbekannt` \| `gesperrt` (Altzustand, wird nicht mehr geschrieben) — eigene Spalte, nicht aus `anbieter IS NOT NULL` abgeleitet: ein Haus, das seinen Katalog führt, aber die Bestandteile nicht freigibt (`gesperrt`), ist etwas anderes als eine ISIN, die kein Katalog kennt (`unbekannt`) |
| `adresse` | `TEXT?` | Name ist Altlast: nur `ishares`, die Produkt-ID des Fonds (ältere Zeilen tragen noch die alte `.ajax`-Adresse, aus der die ID gelesen wird) |
| `geprueft_am` | `TEXT` | Kalendertag des Katalogabrufs [INV-03] |

Primärschlüssel `isin`. Eine Zeile wird ersetzt (`ON CONFLICT … DO UPDATE`), nie ergänzt.
Beispiel: `('IE00B4L5Y983', 'ishares', 'moeglich', '251881', '2026-09-08')`.

## `vpi`

Monatlicher Verbraucherpreisindex, Quelle Eurostat, für die Realrendite in
`core/inflation.ts`. Die Reihe entsteht aus **zwei** Eurostat-Datensätzen: `prc_hicp_midx`
liefert die Historie, `ei_cphi_m` füllt den Rand, wenn der amtliche Datensatz hinterherhinkt
— umbasiert im Ingest, siehe
[ADR-017](entscheidungen/ADR-017-zweiter-eurostat-datensatz-fuer-den-rand.md).

| Feld | Typ | Bedeutung |
|---|---|---|
| `monat` | `TEXT PK` | `YYYY-MM` |
| `index_wert` | `REAL` | Indexstand |
| `quelle` | `TEXT` | `eurostat:prc_hicp_midx` \| `eurostat:ei_cphi_m` (Destatis bleibt der verworfene Zweig, siehe [ADR-003](entscheidungen/ADR-003-eurostat-statt-destatis.md)) |

Beispiel: `('2025-12', 128.4, 'eurostat:prc_hicp_midx')`, `('2026-08', 136.36,
'eurostat:ei_cphi_m')`. Die Spalte sagt damit pro Monat, welcher Datensatz ihn geliefert
hat; holt `prc_hicp_midx` auf, ersetzt der nächste Lauf die nachgefüllten Monate.

## `zins`

Täglicher risikofreier Zins, Quelle EZB (€STR), für die Sharpe-Ratio in `core/risiko.ts`.
Anders als `vpi` täglich statt monatlich, weil der €STR täglich publiziert wird — siehe
[ADR-009](entscheidungen/ADR-009-risikokennzahlen.md).

| Feld | Typ | Bedeutung |
|---|---|---|
| `tag` | `TEXT PK` | `YYYY-MM-DD` |
| `zins_pro_jahr` | `REAL` | €STR p.a., z. B. `-0.0055` |
| `quelle` | `TEXT` | `ezb:EST` |

Beispiel: `('2026-08-20', -0.0055, 'ezb:EST')`

## `lauf`

Protokoll jedes Ingest-Laufs — für `/api/lauf`, das Runbook und die Übergabeprüfliste.
Enthält nie Beträge oder Fremdtext, nur Quellennamen, Statuswerte und Anzahlen.

| Feld | Typ | Bedeutung |
|---|---|---|
| `id` | `INTEGER PK` | fortlaufend |
| `gestartet` | `TEXT` | ISO 8601 |
| `beendet` | `TEXT?` | `null`, solange der Lauf läuft |
| `status` | `TEXT` | `laufend` \| `erfolg` \| `teilweise` \| `fehler` |
| `fehler_code` | `TEXT?` | |
| `fehler_text` | `TEXT?` | |
| `quellen_json` | `TEXT` | Status je Quelle, z. B. `{"kurse":"erfolg","fonds":"fehler"}` |
| `hinweise_json` | `TEXT?` | Befunde des Laufs als `[{art, werte}]` (`shared/hinweise.ts`) — Anzahlen, Tage, ISINs, nie Beträge. Eine gescheiterte Quelle steht hier als `quelleGescheitert` mit ihrem Fehlercode, damit die Oberfläche Ursache und Abhilfe nennen kann. Zeilen von vor der Umstellung halten fertige Sätze und werden als Art `text` gelesen |
| `schritt` | `TEXT?` | Schritt eines laufenden Laufs (`depot`, `kurse`, `fonds`, `inflation`, siehe `LAUF_SCHRITTE`), für die Anzeige am Knopf; `null` vor dem ersten Schritt und nach dem Abschluss. Seit Migration 007 |

Beispiel: `(217, '2026-08-20T06:00:00+02:00', '2026-08-20T06:01:04+02:00', 'erfolg', NULL, NULL, '{"holdings":"erfolg","transaktionen":"erfolg","kurse":"erfolg","sparplaene":"erfolg","fonds":"erfolg","vpi":"erfolg","vpi-aktuell":"erfolg","zins":"erfolg"}', NULL, NULL)`

## Repository-Schicht

`db/repository/*.ts` ist die einzige Stelle, die SQL schreibt — ausnahmslos über
vorbereitete Statements. Jede Datei entspricht einer Tabelle (`transaktion.ts`, `kurs.ts`,
`bestand.ts`, `sparplan.ts`, `etfBestandteil.ts`, `vpi.ts`, `zins.ts`, `depotTag.ts`, `lauf.ts`,
`rawSnapshot.ts`, `fondsAufloesung.ts`, `wertpapierArt.ts`) und übersetzt Zeilen in die `core/`-Typen aus `core/typen.ts` und
`core/dezimal.ts` (`Tx`, `Bestand`, `DepotTag`, `Cent`, `MengeE8`, `KursE6`) — der
Rechenkern sieht nie eine rohe SQLite-Zeile. `inTransaktion` (`db/repository/hilfen.ts`)
umschließt jeden mehrzeiligen Import, damit ein Abbruch mitten im Import keine halb
geschriebene Datenbank hinterlässt [INV-09].
