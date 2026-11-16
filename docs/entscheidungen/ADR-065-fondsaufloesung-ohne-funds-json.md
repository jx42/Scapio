# ADR-065: Fondsauflösung ohne `funds.json` für weitere Anbieter

Fortschreibung von [ADR-018](ADR-018-fondskataloge-statt-einzelabfrage.md) und
[ADR-027](ADR-027-ishares-holdings-per-get-product-data.md).

## Kontext

Seit ADR-027 hat iShares keinen Katalog: Jeder neue iShares-Fonds musste mit seiner Produkt-ID
in `funds.json` eingetragen werden. Fonds anderer Häuser als iShares, Xtrackers und Amundi
blieben ganz außen vor (ADR-018, „nur drei, bewusst“). Eine Durchsicht vom 1.11.2026 fand
öffentliche JSON-Endpunkte ohne Anmeldung, Cookie oder Schlüssel für die iShares-Suche und
für Invesco, J.P. Morgan, Goldman Sachs und Franklin Templeton.

## Entscheidung

- **Sieben Anbieter in `ANBIETER`** (`ingest/anbieter.ts`). Wo es geht, ein Listenkatalog:

  | Anbieter | Katalog | Produkt-ID (`fonds_aufloesung.adresse`) |
  |---|---|---|
  | Xtrackers, Amundi | wie bisher | — |
  | J.P. Morgan | Fund Explorer (`FundsMarketingHandler/fund-explorer`), nur `N_ETF` | — (ISIN) |
  | Goldman Sachs | Sitemap, URLs `/detail/<PV-Nummer>/<ISIN>/…` | PV-Nummer |
  | Franklin Templeton | Produkt-Sitemap, URLs `/produkt/<fundid>/…/<ISIN>` | `fundid` |
  | iShares | **Suche je ISIN** (`core-search`, jeder Treffer bestätigt per `get-product-data`) | `portfolioId` |
  | Invesco | **Suche je ISIN** (`shareclasses/<ISIN>`) | — (ISIN) |

- **Ablauf in `loeseFondsAuf`:** erst alle Listenkataloge. Dann `suche` nur für ISINs, die
  abgelaufen sind, die kein Katalog getroffen hat, die laut `wertpapier_art` kein Einzeltitel
  sind (Art unbekannt, `ETF` oder `FUND`) und deren bisheriger Anbieter nicht gerade gescheitert
  ist. iShares vor Invesco, der erste Treffer gewinnt. Ob eine Zeile abgelaufen ist, bestimmt
  weiter `fondsKatalogFrischeTage`: Je ISIN läuft die Suche höchstens einmal je Ablauffrist.
  Ein Suchtreffer wirkt wie ein Katalogtreffer und schreibt die Produkt-ID sofort in `adresse`,
  damit ein gescheiterter Abruf der Bestände sie nicht für die Frist verliert. Kein Treffer:
  `unbekannt`, außer ein Katalog oder eine Suche ist in diesem Lauf gescheitert — dann bleibt
  die bestehende Zeile (oder es entsteht keine), und der nächste Lauf fragt wieder.
- **Der iShares-Treffer trägt keine ISIN**, nur URL, Fondsname, `portfolioId` und Ticker. Die
  Suche bestätigt deshalb jeden Treffer (höchstens fünf) mit einem weiteren Abruf
  (`get-product-data`, `component=fundHeader`) über `productIsin`; der erste passende gewinnt.
  Alle Abrufe gehen an `www.ishares.com`. Die HTML-Produktseite antwortet unserem User-Agent mit 403.
- **Die Suche ist der letzte Weg.** Eine Suche ohne Treffer verrät dem Anbieter die ISIN eines
  fremden Fonds; Einzeltitel gehen deshalb gar nicht erst in die Suche. Ein Treffer verrät nichts zusätzlich, weil der Abruf der Bestände dieselbe ISIN
  schickt. Ein Listenkatalog verrät nichts. Das Kostenargument aus ADR-018 gegen das
  Durchprobieren trägt hier nicht mehr: Die Suche ist gecacht und läuft nur für den Rest.
- **Ein Fehler je Anbieter und Lauf**, unter `fondskatalog:<anbieter>`, nicht je ISIN. Scheitert
  eine Suche, überspringt der Lauf diesen Anbieter für alle weiteren ISINs. Die
  Oberfläche hat dafür schon „Fondsverzeichnis nicht abgerufen“. `fondskatalog:ishares` steht
  nicht mehr dauerhaft auf „übersprungen“ (ADR-027).
- **`funds.json` bleibt Vorrang** (ADR-018), `FUNDS_JSON_ANBIETER` bei `ishares`, `xtrackers`,
  `amundi`. Die neuen Häuser brauchen keinen Eintrag von Hand. `FundsDatei` und der Dialog der
  fehlenden Fonds bleiben unverändert. Die iShares-Produkt-ID in `funds.json` ist nur noch
  nötig, wenn die Suche nichts findet.
- **Vier neue Hosts** in `ANBIETER_HOSTS`: `dng-api.invesco.com`, `am.jpmorgan.com`,
  `am.gs.com`, `www.franklintempleton.de`. Die Allowlist wächst von fünf auf neun. Alle vier
  sind große, etablierte Vermögensverwalter, die Liste steht weiter fest im Code
  ([SICHERHEIT.md](../SICHERHEIT.md), Restrisiko 1). Eine `config.json` mit eingeschränkter
  `erlaubteHosts`-Liste bleibt eingeschränkt, der Anbieter scheitert dann unter
  `fondskatalog:<anbieter>`.
- Alle vier liefern Gewichte in Prozent, die Quelle teilt durch 100. Schemas ohne `.strict()`
  ([ADR-030](ADR-030-webseiten-antworten-ohne-strict.md)), `pruefeGewichtsSumme` gilt für alle.

## Zerbrechlichkeit

Jeder dieser Endpunkte ist inoffiziell, nichts davon ist ein Vertrag. Belege allein aus der ersten
Novemberhälfte 2026:

- **Invesco** brauchte am 1.11. keinen Parameter, kurz darauf war `loadType=full` Pflicht (ohne
  kam 406), am Abend des 15.11. war es umgekehrt: mit `loadType=full` 406, ohne 200. Die
  Umsetzung schickt den Parameter nicht. Die Antwort auf eine fremde ISIN wechselte von `[]` auf
  `{}`.
- **J.P. Morgan:** Die Sitemap hat ihre ISINs verloren, keine URL enthält mehr eine.
- **Franklin** prüft per Cloudflare die Client-Signatur: Python wird mit 1010 abgewiesen,
  Node-`fetch` kommt durch.

Bricht ein Endpunkt, scheitert der Abruf am Status oder am Schema. Der letzte Stand bleibt
stehen, der Lauf meldet `fondskatalog:<anbieter>` oder `fondsNichtAbrufbar`.

## Verworfene Alternativen

- **J.P. Morgan über die Sitemap:** keine ISIN mehr in den URLs.
- **J.P. Morgan über eine Suche je ISIN mit `product-data`:** verrät fremde ISINs, und „kein
  Treffer“ ist eine 500 mit HTML, nicht von einem Ausfall zu unterscheiden.
- **J.P. Morgan über einen Filter auf Fondsnamen:** unzuverlässig.
- **Suche vor den Katalogen:** verriete jede gehaltene ISIN auch den Häusern, die sie nicht
  führen.
- **Eine neue `QuellenArt` für die Suche:** Der Text zu `fondskatalog` passt.

## Folgen

- Ein Fonds dieser sieben Häuser bekommt Bestandteile, ohne dass jemand `funds.json` anfasst.
- iShares und Invesco erfahren bei einer Suche ohne Treffer auch ISINs fremder Fonds, höchstens
  einmal je ISIN und Ablauffrist ([SICHERHEIT.md](../SICHERHEIT.md), Restrisiko 3).
- Keine Migration: `fonds_aufloesung.anbieter` ist `TEXT` ohne `CHECK`. Der Kommentar in
  `db/migrationen/005-fonds-anbieter.sql` ist veraltet und bleibt so, maßgeblich ist
  [DATENMODELL.md](../DATENMODELL.md#fonds_aufloesung).
- Weitere Häuser (State Street, HANetf, Deka, Global X, VanEck) bleiben offen: Sie brauchen
  einen XLSX- oder HTML-Leser oder einen Katalog aus Seitendaten.
