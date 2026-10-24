# Entscheidungen

Eine Zeile je ADR. Status „gilt“ heißt: ohne Nachfolger; wer abgelöst ist, bleibt als Begründung
der Geschichte stehen. Eine neue ADR bekommt die nächste freie Nummer und eine Zeile hier.

| Nr. | Entscheidung | Status |
|---|---|---|
| [001](ADR-001-stream-json-statt-dateiuebergabe.md) | stream-json-Extraktion statt Dateiübergabe durch das Modell | abgelöst durch 010 |
| [002](ADR-002-node-sqlite-statt-better-sqlite3.md) | `node:sqlite` statt `better-sqlite3` | gilt |
| [003](ADR-003-eurostat-statt-destatis.md) | Eurostat statt Destatis als Quelle für den Verbraucherpreisindex | gilt |
| [004](ADR-004-fixpunkt-arithmetik-statt-float.md) | Fixpunkt-Arithmetik in `bigint` statt Gleitkomma | gilt |
| [005](ADR-005-datenbank-ausserhalb-des-projekts.md) | Datenbank außerhalb des Projektordners | Nachtrag: 056 |
| [006](ADR-006-deutsches-fachvokabular.md) | Deutsches Fachvokabular, englisches Technikvokabular | gilt |
| [007](ADR-007-ausgeglichene-uebertragspaare.md) | Ausgeglichene Übertragspaare als Nicht-Vorgang | gilt |
| [008](ADR-008-fluesse-kachel-zeigt-investition-statt-einzahlung.md) | Kachel 5 zeigt Investition in Wertpapiere statt externer Ein-/Auszahlung | gilt |
| [009](ADR-009-risikokennzahlen.md) | Risikokennzahlen auf Monatsbasis, mit echtem risikofreiem Zins | gilt |
| [010](ADR-010-direkte-mcp-anmeldung-ohne-claude-code.md) | Direkte OAuth/PKCE-Anmeldung am Scalable-MCP statt Claude-Code-Kindprozess | Nachtrag: 054 |
| [011](ADR-011-kursgewinn-statt-twr-in-kachel-1.md) | Verlaufs-Rendite zeigt Kursgewinn, nicht TWR | Name präzisiert durch 016, Zählweise durch 023 |
| [012](ADR-012-anmeldeknopf-als-zweite-mutierende-route.md) | Der Anmeldeknopf als zweite mutierende Route | gilt |
| [013](ADR-013-update-nur-auf-knopfdruck.md) | Ein Update-Befehl, der nur auf Knopfdruck läuft | teilweise abgelöst durch 037; Nachtrag: 055 |
| [014](ADR-014-steuern-nach-typ-statt-nach-vorzeichen.md) | Zinsen und Steuern nach Typ trennen, nicht nach Vorzeichen | gilt |
| [015](ADR-015-summenprobe-nur-bei-gleichem-stand.md) | Die Summenprobe vergleicht nur, wenn beide Seiten denselben Moment beschreiben | ergänzt durch 033 |
| [016](ADR-016-gesamtgewinn-statt-kursgewinn-im-verlauf.md) | Die Zahl über dem Verlauf heißt Gesamtgewinn, nicht Kursgewinn | gilt |
| [017](ADR-017-zweiter-eurostat-datensatz-fuer-den-rand.md) | Zwei Eurostat-Datensätze bilden eine Preisreihe | gilt |
| [018](ADR-018-fondskataloge-statt-einzelabfrage.md) | Fondskataloge statt Einzelabfrage, `funds.json` bleibt als Vorrang | teilweise abgelöst durch 027 |
| [019](ADR-019-shadcn-variablen-als-aliase.md) | shadcn-Variablen als Aliase auf fachliche Tokens statt als Ersatz | ergänzt durch 024 |
| [020](ADR-020-benchmark-vergleich-etf-nav-und-echte-fluesse.md) | Benchmark-Vergleich mit ETF-Kurs statt Index, Vergleichsdepot aus echten Flüssen | Zählweise seit 023 |
| [021](ADR-021-ausgehende-links-justetf-ezb-eurostat.md) | Ausgehende Links zu onvista (ursprünglich justETF), EZB und Eurostat | ISIN-Ziel seit 028 onvista |
| [022](ADR-022-footer-links-scalable-und-repository.md) | Footer-Links zu Scalable Capital und zum Repository | gilt |
| [023](ADR-023-verlauf-zaehlt-ab-fensterbeginn.md) | Der Verlauf zählt ab Fensterbeginn, auch im Vergleich | gilt |
| [024](ADR-024-shadcn-linie.md) | Die shadcn-Linie — `radix-ui`, `new-york-v4`, bewusst abweichende Bausteine | gilt |
| [025](ADR-025-wertpapierart-per-get-security-quote.md) | Wertpapierart per `get_security_quote` | gilt |
| [026](ADR-026-risikofreier-zins-als-benchmark.md) | Der risikofreie Zins als zehnter Eintrag in der Benchmarkwahl | gilt |
| [027](ADR-027-ishares-holdings-per-get-product-data.md) | iShares-Bestandteile per `get-product-data` | gilt |
| [028](ADR-028-onvista-statt-justetf.md) | onvista statt justETF als Ziel des ISIN-Links | gilt |
| [029](ADR-029-liquid-glass-dezent.md) | Liquid Glass dezent als einzige Darstellung | gilt |
| [030](ADR-030-webseiten-antworten-ohne-strict.md) | Antworten von Anbieter-Webseiten ohne `.strict()` | gilt |
| [031](ADR-031-mcp-wiederholung-und-kurzschluss.md) | Wiederholung und laufweiter Kurzschluss am MCP | gilt |
| [032](ADR-032-gesamtwert-aus-portfolio-overview.md) | Gesamtwert für die Summenprobe aus `get_portfolio_overview` | gilt |
| [033](ADR-033-summenprobe-ohne-live-bewertung.md) | Summenprobe nicht gegen eine Live-Bewertung | gilt |
| [034](ADR-034-kachel-ausblenden-im-browser.md) | Kachel ausblenden im Browser, einblenden nur über die Adresse | abgelöst durch 038 |
| [035](ADR-035-zip-als-standardweg-der-installation.md) | ZIP als Standardweg der Installation, Git als Alternative | gilt |
| [036](ADR-036-kennzahlen-korrekturen-nach-pruefung.md) | Kennzahlen-Korrekturen nach der Prüfung vom Oktober 2026 | Nachtrag: 043, 053 |
| [037](ADR-037-eigene-dateien-im-datenverzeichnis.md) | Eigene Dateien im Datenverzeichnis, ZIP-Update ohne Kopieren | Nachtrag: 041 |
| [038](ADR-038-top25-nur-auf-wunsch.md) | Top 25 nur auf Wunsch, Schalter in `einstellungen.json` | gilt |
| [039](ADR-039-server-vor-dem-bau.md) | Server vor dem Bau, Browser sofort, Fortschritt auf der Anmeldeseite | gilt |
| [040](ADR-040-aufgeraeumte-projektwurzel.md) | Aufgeräumte Projektwurzel | gilt |
| [041](ADR-041-seed-im-datenverzeichnis.md) | `seed.json` im Datenverzeichnis | gilt |
| [042](ADR-042-agenten-lesen-keine-depotwerte.md) | Agenten lesen keine Depotwerte | Nachtrag: 054 |
| [043](ADR-043-flusskonvention-und-kapitalmassnahmen.md) | Flusskonvention, Kapitalmaßnahmen und Randfälle im Rechenkern | Nachtrag: 053 |
| 044 | — | nicht vergeben |
| [045](ADR-045-woechentliche-sicherung-beim-start.md) | Wöchentliche Sicherung beim Start | Nachtrag: 056 |
| [046](ADR-046-footer-link-zur-readme.md) | Footer-Link zur Readme | gilt |
| [047](ADR-047-release-kette-und-auslieferung.md) | Release-Kette und Auslieferung: ZIP aus Releases, Audit über den Bau-Pfad | Nachtrag: 055 |
| [048](ADR-048-demo-als-statischer-abzug.md) | Demo als statischer Abzug | Nachtrag: 055 |
| [049](ADR-049-deinstallation-loescht-nur-den-datenordner.md) | Deinstallation löscht nur den Datenordner | Nachtrag: 056 |
| [050](ADR-050-zeitzonen-in-der-ci-nur-unter-linux.md) | Zeitzonen in der CI nur unter Linux, ohne UTC | gilt |
| [051](ADR-051-main-nur-ueber-pull-requests.md) | `main` nur über Pull Requests, ohne Bypass | Nachtrag: 055 |
| [052](ADR-052-demo-band-mit-repository-link.md) | Demo-Band mit Link zum Repository | gilt |
| [053](ADR-053-stichtag-und-isin-wechsel-im-kern.md) | Stichtag der Kennzahlen, ISIN-Wechsel und Selbstkontrolle ohne Cash | gilt |
| [054](ADR-054-agentensperre-in-den-einstellungen.md) | Agentensperre in den Einstellungen, Toolnamen ohne Präfix | gilt |
| [055](ADR-055-update-und-release-kette.md) | Update- und Release-Kette geschlossen | gilt |
| [056](ADR-056-datenverzeichnis-und-dateirechte-aus-einer-hand.md) | Datenverzeichnis und Dateirechte aus einer Hand | gilt |
| [057](ADR-057-rebalancing-rechner.md) | Rebalancing-Rechner als Rechnung, nicht als Empfehlung | gilt |
