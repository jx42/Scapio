# Architektur

Diese Seite beantwortet zwei Fragen: wie fließen Daten durch die Anwendung, und warum sind
Ingest, Rechenkern, Server und Oberfläche vier getrennte Ordner statt eines großen.

## Datenfluss

```
MCP / iShares / Xtrackers / Amundi / Eurostat / EZB  →  Ingest (validiert)  →  SQLite  →  Rechenkern  →  API  →  Oberfläche
```

Der Pfeil geht nur nach rechts. Kein Modul liest, was rechts von ihm steht:

- Die **Oberfläche** rechnet nicht — sie zeigt, was die API liefert, formatiert über
  `src/lib/format.ts`.
- Der **Server** rechnet nicht — er liest Repositories, reicht das Ergebnis durch
  `core/`-Funktionen und liefert JSON aus.
- Der **Rechenkern** liest nichts — jede Funktion in `core/` bekommt ihre Eingaben als
  Parameter und hat keine Ahnung von SQLite, Uhrzeit oder Netzwerk. [INV-04]
- Der **Ingest** schreibt nur validierte Daten in die Datenbank, nie umgekehrt.

Warum vier getrennte Teile statt eines Skripts: Der Ingest verarbeitet fremde, nicht
vertrauenswürdige Daten (MCP- und Anbieter-Antworten) und braucht deshalb die strengste Kapselung —
nur lesende MCP-Aufrufe, zod an jeder Grenze [INV-01, INV-12]. Der Rechenkern muss
deterministisch und ohne Umgebung testbar sein, weil
er die einzige Stelle ist, an der eine falsche Zahl entstehen könnte — Reinheit ist hier
kein Stilideal, sondern die Voraussetzung für `npm run verify` [INV-04]. Server und
Oberfläche trennen sich, weil nur der Server einen Netzwerk-Port öffnet und damit die
einzige Angriffsfläche der Anwendung ist [INV-07] — die Oberfläche bleibt statisches,
gebautes JavaScript ohne eigene Rechte.

Welcher Ordner welche Schicht ist, steht in AGENTS.md, „Aufbau"; dort auch die Liste von
`shared/`, was keiner Schicht gehört und mehrere brauchen. Den Invariantentests
gelten sie als ausgeliefert wie jeder Ordner; `AUSGELIEFERT` (`test/invarianten/quellen.ts`)
nimmt `shared/` und zusätzlich jede `*.ts` der Wurzel außer `*.config.ts` von selbst auf.

## Wie der Ingest an den MCP kommt

Der Scalable-MCP hängt am claude.ai-Login, nicht an einem API-Key — weder ein Browser noch
ein eigener Server kann sich dort selbst anmelden. `ingest/mcpAnmeldung.ts` meldet sich
deshalb als eigener, per Dynamic Client Registration angemeldeter OAuth-Client über den
Autorisierungscode-Fluss mit PKCE an: einmalig, interaktiv, über `npm run mcp-login`
(`start/mcpLogin.ts`) — öffnet den Browser, wartet auf den Redirect nach
`127.0.0.1:8732/callback`, tauscht den Code gegen `access_token`/`refresh_token` und legt
beide über `ingest/mcpToken.ts` unter `<datenverzeichnis>/mcp/` ab (Verzeichnis `0700`, Dateien `0600`, dasselbe
Vertrauensmodell wie bei der Datenbank — unter Windows wirken diese POSIX-Bits nicht, siehe
[`docs/SICHERHEIT.md`](SICHERHEIT.md), Restrisiko 2). Jeder Ingest-Lauf danach tauscht bei Bedarf still
gegen den Refresh-Token (`zugriffstoken()`) — dabei öffnet sich nie von selbst ein Browser;
schlägt der Tausch fehl, bricht der Lauf mit `E_MCP_ANMELDUNG` ab (siehe
[`docs/RUNBOOK.md`](RUNBOOK.md)).

`ingest/mcp.ts` ruft danach über `ingest/mcpTransport.ts` JSON-RPC (`initialize`, `tools/call`) gegen
`https://mcp.scalable.capital/mcp` auf und liest die Nutzdaten direkt aus dem `content[]`-Block
der Werkzeugantwort — nie aus Modelltext, denn es gibt seit dieser Umstellung kein Modell
mehr im Datenpfad. `LESENDE_TOOLS.includes(tool)` steht dabei als allererste Anweisung vor
jeder Konfiguration und jedem Netzwerkzugriff — die einzige verbleibende
Laufzeit-Durchsetzung von INV-01, seit kein Kindprozess mit eigener `--allowedTools`-Sperre
mehr existiert. Jeder `fetch` gegen `/token` und `/mcp` läuft mit `redirect: 'manual'`, damit
der `Authorization`-Kopf nie einer automatisch befolgten Umleitung folgt. Details stehen in
`ingest/CLAUDE.md`; warum diese Umstellung weg vom vorherigen `claude`-Kindprozess erfolgte
und was sie kostet, in
[ADR-010](entscheidungen/ADR-010-direkte-mcp-anmeldung-ohne-claude-code.md).

Jede Antwort geht danach durch ein `zod`-Schema, bevor sie die Datenbank berührt [INV-12].
Schlägt die Validierung fehl, bricht der Lauf ab und die alte Datenbank bleibt unangetastet.
Rohantworten landen zusätzlich in `raw_snapshot`, sodass sich jede Kennzahl später ohne
erneuten Abruf neu berechnen lässt — das ist, was `npm run verify` tatsächlich neu rechnet.

## Inkrementelle Neuberechnung

Die Rekonstruktion der gesamten Historie ist die teuerste Operation der Anwendung. Sie wird
einmal geleistet und bleibt in `depot_tag` liegen. Der Mechanismus ist eine Hochwassermarke:
jede Zeile trägt `kern_version` und einen `eingabe_hash`; ein Lauf berechnet nur Tage neu,
für die mindestens eines davon nicht mehr stimmt — ab dem Minimum aus letztem berechneten
Tag + 1, dem Datum der ältesten neuen Transaktion, dem ältesten Tag mit geändertem Kurs, oder
dem Anfang der Zeit, falls `KERN_VERSION` gestiegen ist. Siehe `docs/DATENMODELL.md` für die
Tabelle und `core/version.ts` für INV-10.

Die Positionsaufteilung des letzten Tages läuft als Nebenprodukt derselben Neuberechnung mit
und landet in `depot_tag.positionen_json`. `server/lesemodell.ts` liest sie von dort, statt bei
jeder Anfrage die Reihe erneut ab dem ersten Tag zu bauen; nur wenn der Cache leer ist (vor dem
ersten Lauf nach Einführung dieser Spalte, oder bei einem reinen Cash-Depot), baut es sie
einmalig neu.

XIRR und TWR werden bewusst nie inkrementell gerechnet — sie laufen über die gesamte
Cashflow-Historie, und bei einigen hundert Cashflows kostet das ohnehin unter einer
Millisekunde. Der Look-Through wird dagegen gecacht (`etf_bestandteil`), weil das Parsen der
Anbieter-Bestandslisten spürbar Zeit kostet.

Ein `TRANSFER_OUT`/`TRANSFER_IN`-Paar derselben ISIN mit exakt entgegengesetzter Menge zählt
dabei nirgends mit — weder im Cashflow noch im Eingabe-Hash. Siehe
[ADR-007](entscheidungen/ADR-007-ausgeglichene-uebertragspaare.md).

## API-Vertrag

Neun lesende Routen, zwei mutierende. Jede Antwort trägt zusätzlich `stand` und `drift`
(`umschlagAus`, siehe `server/json.ts`) — Zeitpunkt der letzten Berechnung und die
aktuelle Drift-Stufe, unabhängig vom eigentlichen Inhalt der Route.

| Route | Parameter | Liefert |
|---|---|---|
| `GET /api/health` | — | Version, `KERN_VERSION`, Schalter `top25`, Status des letzten Laufs |
| `GET /api/kennzahlen` | — | Investiert, Kursgewinn, Realisiertes, TWR, IZF (Feld `xirr`), Realrendite, Volatilität, Max. Drawdown, Sharpe-Ratio |
| `GET /api/zeitreihe` | `zeitraum` oder `von` + `bis` (`YYYY-MM-DD`, Zeitraumregler), `benchmark` | Depotwert- und Gesamtgewinnreihe (€/%) für ein Fenster, gezählt ab Fensterbeginn, mit Vergleichsdepot; über drei Jahre ein Punkt je Woche (plus Fensterbeginn und Markentage); dazu der begrenzte `ausschnitt` und alle Tage der Reihe als Reglerstufen. Der Demo-Abzug kennt nur `zeitraum` |
| `GET /api/aufteilung` | — | Positionen mit Art ([ADR-025](entscheidungen/ADR-025-wertpapierart-per-get-security-quote.md)), Einstand, Buchgewinn, Positions-IZF (Feld `xirr`) |
| `GET /api/rebalancing` | `ziel` (`KONTO`/ISIN`:`Basispunkte, Summe 10 000, höchstens 50), `ohneVerkaeufe` (`0`/`1`) | je Zeile Ist, Soll, Betrag zum Ziel und Anteil danach; ohne Verkäufe der Abstand zum Ziel ([ADR-057](entscheidungen/ADR-057-rebalancing-rechner.md)). Der Demo-Abzug kennt nur das feste Beispielziel |
| `GET /api/top25` | — | Look-Through auf Unternehmen, mit `abdeckung` |
| `GET /api/fluesse` | `fenster` | Nettoinvestition in Wertpapiere je Monat, Schnitt, 12-Monats-Schnitt, Median |
| `GET /api/sparplaene` | — | laufende Sparpläne, Monatssumme |
| `GET /api/lauf` | — | Fortschritt des letzten/laufenden Ingest-Laufs |
| `GET /api/mcp-anmeldung` | — | ob eine MCP-Anmeldung existiert, ob gerade eine läuft, Code der letzten gescheiterten |
| `POST /api/refresh` | keiner | stößt einen neuen Ingest-Lauf an, Antwort `202` [INV-08] |
| `POST /api/mcp-anmeldung` | keiner | stößt die OAuth/PKCE-Anmeldung am Scalable-MCP an, Antwort `202` [INV-08, ADR-012] |

Die beiden `POST`-Routen sind die einzigen mutierenden. Beide nehmen keine Eingabe entgegen,
beide antworten sofort mit `202` und lassen die Oberfläche den Ausgang über die zugehörige
`GET`-Route abfragen — `/api/lauf` für den Ingest, `/api/mcp-anmeldung` für die Anmeldung.
`POST /api/mcp-anmeldung` schreibt nichts in die Datenbank; es berührt genau
`<datenpfad>/mcp/token.json`. Warum das INV-08 nicht aufweicht, steht in
[ADR-012](entscheidungen/ADR-012-anmeldeknopf-als-zweite-mutierende-route.md).

`POST /api/refresh` nennt in der `202` die Nummer des angestoßenen Laufs (`laufId`), in der
`409` die des bereits laufenden; `GET /api/lauf` nennt dieselbe Nummer zu jedem Fortschritt.
Die Oberfläche wartet auf genau diese Nummer, nicht auf „irgendeinen Endstatus“: beim Klick
hält der Cache noch die Antwort für den **vorigen** Lauf, und der ist bereits beendet. Ohne
den Nummernvergleich hielte sie dessen Endstatus für das Ende des eben gestarteten Laufs und
hörte sofort auf zu fragen — der Lauf liefe weiter, sichtbar wäre er nicht.

`nurDieseParameter` (`server/fehler.ts`) weist jeden nicht gelisteten Query-Parameter mit
`E_PARAMETER` zurück — eine Route kennt nur genau die Parameter, die oben stehen, nie mehr.
Ein Fehler ist immer `{ fehler: { code, text, hinweis } }` unter dem passenden HTTP-Status (ein `409` trägt daneben den laufenden Lauf); die vollständige Liste der Codes steht
in `server/fehler.ts` (`E_HOST`, `E_HERKUNFT`, `E_TOKEN`, `E_PARAMETER`, `E_RUMPF`,
`E_METHODE`, `E_NICHT_GEFUNDEN`, `E_SPERRE`, `E_INTERN`) — nie ein Stacktrace, nie SQL, nie
ein Dateipfad. Das gilt auch für Codes, die aus `ingest/` durchgereicht werden: der Zustand
der Anmeldung nennt nur den eigenen Code (`E_MCP_ANMELDUNG`, sonst `E_UNBEKANNT`) und einen
eigenen Satz, nie die Meldung der Gegenstelle.

## Konfiguration

`config.json` neben `package.json`, darüber `einstellungen.json` im Datenverzeichnis, beide
durch `shared/konfiguration.ts` gegen ein `zod`-Schema geprüft; jeder Wert hat eine Vorgabe im Code,
beide Dateien sind optional. Kein Wert daraus erreicht je eine Kommandozeile oder eine
SQL-Zeichenkette.

`einstellungen.json` gehört dem Nutzer und überlebt jedes Update; sie darf alle Schlüssel
setzen außer `datenverzeichnis` und `erlaubteHosts`, die nur in der eingecheckten
`config.json` stehen. Ein Feld `hinweis` wird ignoriert; es trägt die Anleitung in der
Vorlage `docs/einstellungen.example.json`. Ebenfalls im Datenverzeichnis liegen die eigene Fondsliste `funds.json` und der Anfangsbestand `seed.json` [ADR-041].
Der Start zieht beide einmalig aus dem Projektordner um (`start/uebernahme.ts`)
[ADR-037](entscheidungen/ADR-037-eigene-dateien-im-datenverzeichnis.md).

| Schlüssel | Vorgabe | Bedeutung |
|---|---|---|
| `port` | `4732` | einziger Port, an dem der Server hört [INV-07] |
| `datenverzeichnis` | plattformabhängig: macOS `~/Library/Application Support/scapio`, Windows `%LOCALAPPDATA%\scapio` | `vorgabeDatenverzeichnis()` in `shared/konfiguration.ts`, siehe [ADR-005](entscheidungen/ADR-005-datenbank-ausserhalb-des-projekts.md) |
| `mcpZeitlimitMs` | `300000` | Zeitlimit je MCP-Aufruf |
| `csvZeitlimitMs` | `30000` | Zeitlimit je Holdings-/CSV-Abruf (iShares, Xtrackers, Amundi) |
| `csvGroesstMb` | `32` | Größtgrenze einer Holdings-/CSV-Antwort |
| `erlaubteHosts` | `www.ishares.com`, `etf.dws.com`, `www.amundietf.de`, `ec.europa.eu`, `data-api.ecb.europa.eu` | Allowlist für jeden Netzabruf, keine Musterliste; Vorgabe abgeleitet aus `shared/hosts.ts` |
| `inflationsquelle` | `eurostat` | siehe [ADR-003](entscheidungen/ADR-003-eurostat-statt-destatis.md) |
| `zinsquelle` | `ecb` | siehe [ADR-009](entscheidungen/ADR-009-risikokennzahlen.md) |
| `driftSchwellen` | `{ hinweis: 0.001, banner: 0.005, abbruch: 0.02 }` | müssen aufsteigend sein, siehe [`docs/RUNBOOK.md`](RUNBOOK.md) |
| `top25` | `false` | Kachel „Top 25 Unternehmen“ und der Abruf der Fondsbestandslisten; der Server meldet den Wert in `/api/health` [ADR-038](entscheidungen/ADR-038-top25-nur-auf-wunsch.md) |

`port` und `driftSchwellen` liest der Server, `erlaubteHosts`/die Zeitlimits liest der
Ingest, `top25` lesen beide, `datenverzeichnis` lesen beide über `start/` — `core/` liest `config.json`
nie [INV-04].

## Sicherheitsarchitektur (Kurzfassung)

Der Server bindet ausschließlich an `127.0.0.1` [INV-07], aber Localhost ist keine
Sicherheitsgrenze — jede Webseite im selben Browser kann Anfragen dorthin schicken. Ein
einziges `onRequest`-Plugin (`server/sicherheit.ts`) prüft deshalb bei **jeder** Route Host
und Origin, setzt sieben Sicherheits-Kopfzeilen und verlangt für die beiden mutierenden
Routen zusätzlich ein Sitzungstoken. Alle Antworten sind `no-store`; die einzige Ausnahme sind die
inhaltsadressierten Dateien unter `/assets/`, die ein Jahr `immutable` bekommen — begründet
in [`docs/SICHERHEIT.md`](SICHERHEIT.md), entschieden in `server/sicherheit.ts` und nirgends
sonst. Das vollständige Bedrohungsmodell, jeder Befund und jeder dagegen gerichtete Test
stehen ebenfalls in [`docs/SICHERHEIT.md`](SICHERHEIT.md).

## Farben, Schrift, Kontrast

`src/styles/theme.css` ist die einzige Datei mit Farbwerten — und die einzige mit einer
Schriftdefinition. Es gibt dort genau **ein** `--font-sans` und genau **ein** `--font-heading`
(Tailwind-Utility `font-heading` auf Überschriften und Karten-/Dialogtiteln); beide zeigen
auf dieselbe Schrift, `'Geist Variable'`, danach die Systemschriften als Rückfall. Die
Schrift kommt aus dem npm-Paket `@fontsource-variable/geist`, wird mitgebaut und später
vom eigenen Server aus `/assets/` ausgeliefert — keine fremde Adresse [INV-11].
Jede Variable ist genau einmal definiert; eine zweite ersetzte die erste still.
Eckenradien stehen aus demselben Grund als feste Werte da (`--radius-sm/md/lg/xl`), nicht
als `calc()` auf einer Zwischenvariablen.

Recharts und alle Komponenten lesen ausschließlich `var(--color-…)`, nie einen Hex-Wert aus
dem Code [`src/CLAUDE.md`]. Wofür welches Token, welche Chartfarbe und welche Fläche (`glas`,
`schwebend`, `bedien`) da ist, steht in [DESIGN.md](../DESIGN.md). Kontraste rechnet ein Test
aus den Tokens nach; Tabelle und Regeln stehen in [BARRIEREFREIHEIT](BARRIEREFREIHEIT.md#kontrast).

## Die zwölf Invarianten

Die Regeln stehen in AGENTS.md, jede hat einen Test in `test/invarianten/`.
Elf der zwölf sind Zustände, die zu jedem Zeitpunkt gelten und die ihr Test genau deshalb
ohne besonderen Anlass prüfen kann. INV-10 ist anders: keine Eigenschaft des Codes, sondern
eine Pflicht bei einer Änderung — leicht zu vergessen, weil ihr Test (`inv-10.test.ts`)
erst beim nächsten Ändern von `core/` auffällt, nie beim Lesen des unveränderten Codes. Sie
ist trotzdem die nützlichste der zwölf: ohne sie bliebe eine korrigierte Rechenregel in
`depot_tag` unbemerkt neben den alten, falschen Werten liegen, weil an der Zeile selbst
nichts auf ihr Alter hindeutet — die Hochwassermarke (siehe oben) erzwingt stattdessen eine
vollständige Neuberechnung aus `raw_snapshot`, sobald `KERN_VERSION` steigt.

## Wo etwas angeschlossen wird

Dateien in dieser Reihenfolge; was der Compiler nicht bindet, ist vermerkt.

**Neue Kennzahl** (Rechnung im Kern, Anzeige in der Kennzahlen-Kachel)

| # | Datei | Was |
|---|---|---|
| 1 | `core/<rechner>.ts` | die Rechnung, rein [INV-04] |
| 2 | `core/kennzahlen.ts` | in `berechneKennzahlen` einhängen |
| 3 | `core/version.ts`, dann `npm run abdruck` | `KERN_VERSION` erhöhen [INV-10] |
| 4 | `server/json.ts` | JSON-Hilfe, wenn der Wert `bigint` oder `NaN` tragen kann; ein neuer Ergebnistyp bekommt sein Schema über `objektSchema<Vereinigt<T>>()`, dann meldet `tsc` ein fehlendes Feld |
| 5 | `server/vertrag.ts` | Feld in `KennzahlenAntwort` — die eine Typquelle |
| 6 | `server/routen/kennzahlen.ts` | Schema und Handler; ein fehlendes Schemafeld meldet `tsc` |
| 7 | `src/lib/format.ts`, `src/i18n/de.ts` | Format und Text |
| 8 | `src/features/kennzahlen/KennzahlenAnsicht.tsx`, `src/features/verlauf/VerlaufKennzahlen.tsx` | Zeile in Kachel 3; Karte in der Verlaufskachel, falls sie dort erscheint |
| 9 | `test/core/` | Rechentest |
| 10 | `test/api/vertrag.test.ts` | `felder<…>()` des Ergebnistyps; ein fehlendes Feld meldet `tsc` |
| 11 | `test/ui/fixtures.ts` | Grundwert in `kennzahlenAntwort()`; `tsc` meldet ihn |
| 12 | `test/edgecases/faelle.ts` | Randfall, wenn die Kennzahl einen eigenen Zustand hat (nicht berechenbar, leer) |

**Neues Antwortfeld einer anderen Route:** Schritte 5–12 sinngemäß, mit der jeweiligen Route
unter `server/routen/` und der Kachel unter `src/features/`.

**Neue Route** — nur `GET`; eine dritte mutierende Route gibt es nicht [INV-08, ADR-012].

| # | Datei | Was |
|---|---|---|
| 1 | `shared/routen.ts` | Pfad und erlaubte Query-Parameter in `LESENDE_ROUTEN`; Demo-Abzug und Randfallseite folgen daraus |
| 2 | `server/vertrag.ts` | Antworttyp |
| 3 | `server/routen/<name>.ts` | `registriere<Name>(app, ctx)`: `objektSchema<T>()` für die Antwort, `nurDieseParameter(…, LESENDE_ROUTEN.<name>.parameter)` für die Query, `umschlagAus` für `stand` und `drift`; Vorlage `sparplaene.ts` |
| 4 | `server/server.ts` | Import und Aufruf neben den anderen `registriere…` — fehlt der Aufruf, bricht der Start ab |
| 5 | `server/fehler.ts` | nur bei neuem Fehlercode: `FehlerCode` und Fabrikfunktion |
| 6 | `src/lib/api.ts` | Eintrag `holen<T>(LESENDE_ROUTEN.<name>.pfad)` und Query-Key in `schluessel` |
| 7 | `src/features/<kachel>/` | Hook und Anzeige |
| 8 | `test/api/vertrag.test.ts` | `felder<T>()` der Antwort; ein fehlendes Feld meldet `tsc` |
| 9 | `docs/ARCHITEKTUR.md` | Zeile in der Tabelle unter „API-Vertrag" |

**Neue Spalte**

| # | Datei | Was |
|---|---|---|
| 1 | `db/migrationen/<nächste Nummer>-*.sql` | vorwärts-only, `PRAGMA user_version` folgt |
| 2 | `docs/DATENMODELL.md` | Tabelle und Spalte |
| 3 | `db/repository/<tabelle>.ts` | `Zeile`, `SPALTEN` (`satisfies Spalten<Zeile>`) und Mapper `zu()` — Bindung und Platzhalter folgen aus `SPALTEN` |
| 4 | `ingest/schema/<quelle>.ts`, `ingest/quellen/<quelle>.ts` | wenn die Quelle das Feld liefert [INV-12] |
| 5 | `ingest/importieren.ts` | bei `Tx`: `VERGLICHENE_FELDER`, sonst wird eine Änderung nie erkannt |
| 6 | `test/db/repository.test.ts` | Roundtrip |

## Verweise auf die frühere Bauanleitung

Kommentare im Code zitieren an vielen Stellen `[P-01]` … `[P-13]` (Pflichten) und `§N`
(Abschnitte) aus der Bauanleitung, dem Planungsdokument vor dem ersten Bau. Das Dokument
selbst existiert nicht mehr — sein Inhalt ist in dieses Verzeichnis übergegangen. Die
Zitate im Code bleiben stehen, weil sie an Ort und Stelle den Grund einer einzelnen
Entscheidung belegen; diese Tabelle löst sie auf, statt jede einzelne Fundstelle umzuschreiben.

| Verweis | Thema | Heute nachlesbar in |
|---|---|---|
| P-01 | Keine Portfoliowert-Zeitreihe von der Bank — sie wird rekonstruiert | [Datenfluss](#datenfluss) |
| P-02 | Plausibilitäts-/Driftprüfung ist nicht optional | [RUNBOOK: Drift-Banner erschienen](RUNBOOK.md#drift-banner-erschienen) |
| P-04 | Kursrang über ein grobes Zeitfenster statt exaktem Datum | `core/kursraster.ts` |
| P-05 | Abgeleitete Größen (TWR, Inflation, Typen) speisen sich aus derselben Reihe | [Datenfluss](#datenfluss) |
| P-06 | Vertrag der Oberfläche: Formatierung, Texte, Tokens, Barrierefreiheit | `src/CLAUDE.md` |
| P-07 | Hochwassermarke: ältere Tage werden nicht neu gerechnet | [Inkrementelle Neuberechnung](#inkrementelle-neuberechnung) |
| P-08 | Lieber sichtbar als still falsch: eine Abweichung wird gekennzeichnet, nicht geglättet oder geraten — dazu gehört die Plausibilitätstoleranz (~0,5 %) zwischen unabhängigen Quellen | [RUNBOOK: Zahlen sehen falsch aus](RUNBOOK.md#zahlen-sehen-falsch-aus) |
| P-09 | `Cache-Control` auf jeder Antwort | [SICHERHEIT: Kopfzeilen und Herkunftsprüfung](SICHERHEIT.md#kopfzeilen-und-herkunftsprüfung-im-detail) |
| P-10 | Extreme Jahresrenditen kappen (`proJahr` wird `null`) | `core/twr.ts` |
| P-11 | VPI ist die Grundlage der Realrendite | `docs/GLOSSAR.md`, Eintrag „Kennzahl" |
| P-13 | `seed.json` als Ausweg gegen zu kleine Nenner in der Rendite | [RUNBOOK: Zahlen sehen falsch aus](RUNBOOK.md#zahlen-sehen-falsch-aus) |

| Abschnitt | Thema | Heute nachlesbar in |
|---|---|---|
| §5.1 / Abschnitt 5.1 | DB-Verbindung, PRAGMAs, Migrationsläufer, Sicherung | `db/verbindung.ts` |
| §6.1 | Orchestrierung eines Ingest-Laufs | [Datenfluss](#datenfluss) |
| §6.4 | Plausibilität über mehrere Quellen hinweg (die Prüfliste; ihre Selbstkontrolle ist §7.7) | [RUNBOOK: Zahlen sehen falsch aus](RUNBOOK.md#zahlen-sehen-falsch-aus) |
| §6.5 | Abgesicherter `fetch` für CSV und VPI | [SICHERHEIT](SICHERHEIT.md) |
| §7.2 | Kalendertag ohne Uhr, über `Intl.DateTimeFormat` | INV-03, INV-04 (AGENTS.md) |
| §7.3 | Neuberechnung ab der Hochwassermarke | [Inkrementelle Neuberechnung](#inkrementelle-neuberechnung) |
| §7.7 | Selbstkontrolle: Kontostand gegen Rechenkern | [RUNBOOK: Zahlen sehen falsch aus](RUNBOOK.md#zahlen-sehen-falsch-aus) |
| §8 | Jede API-Antwort trägt `stand` und `drift` | [API-Vertrag](#api-vertrag) |
| §9 | Origin-/Host-Prüfung, Token, Cache-Control | [SICHERHEIT: Kopfzeilen und Herkunftsprüfung](SICHERHEIT.md#kopfzeilen-und-herkunftsprüfung-im-detail) |
| Abschnitt 10.2 | Vertrag der `<Kachel>`: drei Zustände | `src/components/Kachel.tsx`, `src/CLAUDE.md` |
| Test-Matrix „Durchstich" | Der eine e2e-Ablauf mit echtem Chromium | `test/e2e/durchstich.spec.ts` |

## Verwandte Dokumente

- [`docs/DATENMODELL.md`](DATENMODELL.md) — jede Tabelle, jedes Feld.
- [`docs/SICHERHEIT.md`](SICHERHEIT.md) — Bedrohungsmodell und Befundtabelle.
- [`docs/RUNBOOK.md`](RUNBOOK.md) — was tun, wenn etwas nicht stimmt.
- [`docs/BARRIEREFREIHEIT.md`](BARRIEREFREIHEIT.md) — WCAG-2.2-Regeln der Oberfläche und ihre Prüfung.
- [`docs/entscheidungen/`](entscheidungen/README.md) — die ADRs, mit Status je ADR, hinter den ungewöhnlichsten
  Entscheidungen.
