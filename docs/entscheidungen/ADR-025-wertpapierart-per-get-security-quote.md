# ADR-025: Wertpapierart per `get_security_quote`

## Kontext

Kachel 2 („Aufteilung") bekommt eine Spalte „Art" (Aktie, ETF, …). Die Art lässt sich aus der
ISIN nicht ableiten; das Präfix nennt nur das Land. `get_security_quote` der Bank liefert sie
als `security.securityType` (geprüft: `STOCK`, `ETF`, `FUND`, `CRYPTO_ETP`; Gold-ETCs meldet die Bank als `ETF`, Anleihen als `STOCK`; weitere Werte sind unbeobachtet).
justETF taugt nicht als Quelle: `stock-profiles/<ETF-ISIN>` gibt 404, `etf-profile.html` zu
einer Aktien-ISIN aber eine allgemeine Suchseite ohne Fehler.

## Entscheidung

- **Allowlist:** `get_security_quote` kommt in `LESENDE_TOOLS`. Es liest nur, es ist kein
  handelndes Tool; die Laufzeitprüfung in `mcpAufrufRoh` bleibt unverändert. [INV-01]
- **Eigene Tabelle `wertpapier_art`** (Migration 006) statt einer Spalte in `bestand`:
  `bestand` wird bei jedem Lauf vollständig ersetzt, die Art einer ISIN ändert sich nie. Die
  Tabelle ist ein Cache; abgefragt werden nur ISINs, die noch nicht drinstehen.
- **Ausfall ist kein Abbruch.** Scheitert eine Abfrage, entsteht ein Hinweis, die Position
  zeigt „–". Die Quelle `art` steht nur dann
  auf `fehler`, wenn alle Abfragen des Laufs scheiterten.
- **Schema strikt** (`ingest/schema/wertpapier.ts`), wie jede fremde Antwort. [INV-12]
  `securityType` ist Fremdtext: gespeichert in Großbuchstaben, nie als Markup gerendert, nie
  in einen `href` gesetzt. [INV-06]
- **Link:** unabhängig von der Art — seit [ADR-028](ADR-028-onvista-statt-justetf.md) führt die onvista-ISIN-Suche für jede Art zur Produktseite. Die Art dient nur der Anzeige.

## Folgen

- Eine neue Art  erscheint unverändert als Rohwert, bis sie in
  `ARTEN` (`src/i18n/de.ts`) eine deutsche Bezeichnung bekommt.
- `npm run vertrag` prüft das Schema gegen die echte Antwort.
- Beim ersten Lauf nach dem Update kostet die Quelle einen Aufruf je gehaltener ISIN, danach
  nur für neu gekaufte.
