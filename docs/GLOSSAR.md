# Glossar

Sprachregel aus `AGENTS.md`: Fachvokabular ist deutsch, technisches Vokabular ist englisch.
Diese Seite definiert das Fachvokabular und hält fest, wie die Grenzfälle entschieden
wurden — nicht, damit sie neu diskutiert werden, sondern damit sie nicht zweimal
unterschiedlich entschieden werden.

## Fachvokabular (deutsch)

| Begriff | Definition |
|---|---|
| **Bestand** | Die von der Bank gemeldete Momentaufnahme des Depots: Stückzahl und Kurs je Position, zum Meldezeitpunkt. Tabelle `bestand`. |
| **Kurs** | Preis eines Wertpapiers an einem Kalendertag, als `kurs_e6` (EUR × 1e6). |
| **Menge** | Stückzahl eines Wertpapiers, als `menge_e8` (Stück × 1e8). |
| **Einstand** | Der nach FIFO ermittelte Anschaffungswert der noch gehaltenen Anteile einer Position. In der Oberfläche **Investiertes Kapital**; im Code und in den Docs bleibt es `einstand`. |
| **Einzahlung** / **Auszahlung** | Eine externe Zahlung *ins* bzw. *aus* dem Depot über das Verrechnungskonto — ein Transaktionstyp, den `einordnen(typ)` in `core/typen.ts` als `'extern'` einordnet. Im Code `Zufluss`/`Abfluss`, zusammen die `Fluesse`, die in IZF und TWR eingehen — in der Oberfläche nie „Zufluss“. |
| **Eingezahltes Kapital** | Einzahlungen minus Auszahlungen von außen, kumuliert (`nettoEinzahlungKumCent`); früher „Netto-Einzahlung“. Depotüberträge von einer anderen Bank zählen mit. Gegenstück zum **Gesamtgewinn**. Nicht verwechseln mit **Investiertes Kapital** (Einstand). |
| **Nettokäufe** | Wertpapierkäufe minus -verkäufe eines Monats — die Balken der Kachel „Käufe & Verkäufe“ (Code: `fluesse`, `investitionsFluesse`). Nicht dasselbe wie das **Eingezahlte Kapital**: Geld auf dem Verrechnungskonto ist eingezahlt, aber noch nicht gekauft. |
| **Sparplan** | Eine wiederkehrende, automatische Order der Bank. Tabelle `sparplan`, Momentaufnahme, wird je Lauf ersetzt. |
| **Lauf** | Eine Ausführung des Ingest — vom Abruf der Quellen bis zur Neuberechnung. Tabelle `lauf`, Route `/api/lauf`. |
| **Depot** | Das gesamte Wertpapierdepot inklusive Cash-Anteil — nicht nur die Wertpapierseite. |
| **Verrechnungskonto** | Das Cash-Konto des Depots (in der Oberfläche nie „Cash“; nur die Aufteilungs-Legende sagt „Bargeld (Verrechnungskonto)“), über das alles läuft, was kein Wertpapier ist: Einzahlungen, Kaufabrechnungen, Zinsen, Steuern. In der Datenbank die Pseudo-ISIN `CASH` in `bestand`; in der Oberfläche die Antwort auf das „Wofür", wenn eine Buchung sich auf kein Wertpapier bezieht. |
| **Bezugswertpapier** | Das Wertpapier, auf das sich eine reine Cash-Buchung *bezieht*, ohne dass sich Stücke bewegen — die Vorabpauschale auf einen ETF, die Ausschüttung aus einem Fonds. Spalte `bezug_isin`, nur Anzeige, nie Rechnung [ADR-014]. |
| **Bestandteil** | Ein einzelnes Unternehmen innerhalb eines ETF, mit Gewicht, Sektor und Land. Tabelle `etf_bestandteil`. |
| **Kachel** | Eine der fünf Oberflächen-Kacheln. „Kachel N“ in Code und Docs meint verbindlich: **1** Verlauf (`src/features/verlauf`), **2** Aufteilung (`aufteilung`), **3** Gewinne & Abzüge (`gewinnquellen`; bis [ADR-059](entscheidungen/ADR-059-kennzahlen-kachel-aufgeloest.md) die Kennzahlen), **4** frei — bis [ADR-060](entscheidungen/ADR-060-aufteilung-mit-reitern.md) der Look-Through, jetzt Reiter Analyse der Aufteilung (`aufteilung/analyse`), **5** Käufe & Verkäufe (`fluesse`), **6** Sparpläne (`sparplaene`). Neue Kommentare nennen besser den Ordnernamen. App-eigenes UI-Vokabular, kein allgemeiner Fachbegriff. |
| **Verlauf** | Die Wertentwicklung des Depots über die Zeit — die Zeitreihe aus `depot_tag`. |
| **Kennzahl** | Eine berechnete Größe wie IZF, TWR oder Realrendite, mit Erklärtext für Laien. |
| **Kursgewinn** | Der Buchgewinn auf den heute gehaltenen Wertpapieren: ihr Marktwert minus ihrem **Einstand**. Ohne Cash, ohne realisierte Gewinne, ohne Erträge, Steuern und Gebühren. So heißt die zweite Karte über dem Verlauf. |
| **Gesamtgewinn** | Der Depotwert inklusive Verrechnungskonto minus allem, was netto eingezahlt wurde (`gesamtCent - nettoEinzahlungKumCent`) — also alles, was das Depot erwirtschaftet hat, einschließlich der Posten, die der **Kursgewinn** weglässt. So heißt die Zahl über dem Verlauf und im Chart-Tooltip, dort gezählt ab Beginn des gewählten Zeitraums ([ADR-023](entscheidungen/ADR-023-verlauf-zaehlt-ab-fensterbeginn.md)). Beide Begriffe stehen auf einer Seite nebeneinander und dürfen auseinanderlaufen, siehe Grenzfälle und [ADR-016](entscheidungen/ADR-016-gesamtgewinn-statt-kursgewinn-im-verlauf.md). |
| **Marktrendite (TWR)** | Die zeitgewichtete Rendite (*Time-Weighted Return*) über die komplette Anlagedauer bzw. auf ein Jahr umgerechnet. Auf der Karte über dem Verlauf „Marktrendite p.a.“ mit „Gesamt:“ darunter. Im Code `twr`. |
| **Interner Zinsfuß (IZF)** | Die geldgewichtete Rendite pro Jahr — englisch *XIRR* (Extended Internal Rate of Return). So heißt er im Popover der Realrendite-Karte; im Code heißt dieselbe Größe `xirr`, siehe Grenzfälle. |
| **Aufteilung** | Die Verteilung des Depotwerts nach Look-Through-Kriterien (Land, Sektor, Unternehmen). |
| **Zielaufteilung** | Die vom Nutzer gesetzten Zielanteile je ISIN und für das Verrechnungskonto, in Prozent mit einer Nachkommastelle; im Code Basispunkte (`zielBp`). Liegt nur im Browser (`portfolio.zielaufteilung`) [ADR-057]. |
| **Betrag zum Ziel** | Was je Zeile gekauft oder verkauft werden müsste, damit das Depot auf der Zielaufteilung steht — in €, nie in Stück. Im Code `deltaCent`. |
| **Rebalancing** | Der Rechner in der Kachel Aufteilung, der den Betrag zum Ziel ausgibt. Eine Rechnung, kein Kaufvorschlag; Fremdwort bleibt, weil es so in jedem Broker steht. |
| **Drift** | Die Abweichung zwischen rekonstruierter und gemeldeter Wahrheit (`core/drift.ts`). International übliches Finanzvokabular, siehe Grenzfälle. |
| **Rechenkern** | Der reine Berechnungsteil in `core/` — Übersetzung von *core*, aber ein feststehender App-Begriff, kein Türkismus. |

## Technisches Vokabular (englisch)

Router, Query, Cache, Hook, Migration, Repository, Token, Snapshot, Backend, Frontend,
Endpoint, Payload, Schema, Build, Bundle, Commit, Branch — Begriffe der Software-Technik,
die auch in deutschsprachiger Fachliteratur unübersetzt stehen. Übersetzen würde hier nicht
mehr Klarheit schaffen, sondern weniger: „Zwischenspeicher" statt „Cache" verschleiert eher,
was es ist, als dass es hilft.

## Grenzfälle

| Begriff | Entscheidung | Begründung |
|---|---|---|
| **Sperre** vs. *Lock* | Die Absicherung gegen Nebenläufigkeit heißt im Code durchgängig `Sperre`, `SPERRDATEI`, `sperre.nimm()` — deutsch, weil sie ein fachliches Verhalten der Anwendung ist (nur ein Lauf gleichzeitig), kein reines Technik-Detail. Die Datei auf der Platte heißt trotzdem `lauf.lock`: die Dateiendung `.lock` ist eine Betriebssystem-Konvention, kein App-Vokabular, und bleibt deshalb unübersetzt. |
| **Snapshot** vs. *Momentaufnahme* | Die Tabelle heißt `raw_snapshot`, nicht `roh_momentaufnahme` — es ist ein Audit-Trail-Konzept aus der Datenbanktechnik (ein unveränderlicher Abzug zu einem Zeitpunkt), kein fachlicher Depot-Begriff. In Fließtext wird dagegen „Momentaufnahme" verwendet, wenn eine *fachliche* Sache gemeint ist (der `bestand`, der `sparplan`) — der Unterschied ist Technik vs. Fachlichkeit, nicht Beliebigkeit. |
| **Exposure** | Bleibt englisch. Der Euro-Betrag, mit dem das Depot über alle ETFs und Einzeltitel an einem Unternehmen beteiligt ist (`exposureCent`); Spaltenkopf der Top-25. „Engagement“ oder „Gewicht“ wären mehrdeutig. |
| **Look-Through** | Bleibt englisch/mit Bindestrich. Es ist ein etablierter Finanzbegriff („look-through exposure") ohne gebräuchliche deutsche Entsprechung — „Durchschau" existiert, wird in der Praxis aber nicht verwendet. In Prosa steht ergänzend „Blick durch die ETFs". |
| **Hash** | Bleibt englisch (`eingabe_hash`, `core/hash.ts`) — reiner Technikbegriff, „Streuwert" wäre korrekt, aber in keiner Code-Konvention der Anwendung sonst verwendet. |
| **Token** | Bleibt englisch (`Sitzungstoken`, `X-Portfolio-Token`) — HTTP-/Sicherheitsvokabular. In Komposita wie `Sitzungstoken` steht trotzdem ein deutsches Bestimmungswort davor, weil *was* das Token ist (eine Sitzung), fachlich ist, auch wenn *Token* selbst Technik bleibt. |
| **TWR, FIFO** | Bleiben als internationale Akronyme unübersetzt — das sind feststehende Fachbegriffe der Finanzmathematik, für die es keine deutschen Akronyme gibt, die jemand tatsächlich verwendet. TWR steht in der Oberfläche aber nie allein als Name, sondern in Klammern hinter **Marktrendite**: das Akronym sagt Laien nichts, „Marktrendite“ sagt, wofür die Zahl taugt (Vergleich mit dem Markt). |
| **IZF** vs. *XIRR* | In der Oberfläche heißt die geldgewichtete Rendite **Interner Zinsfuß (IZF)** — anders als bei TWR und FIFO gibt es hier ein gebräuchliches deutsches Akronym, und der Erklärtext der Kennzahl nennt beide Namen. Im Code bleibt es `xirr` (`core/xirr.ts`, Feld `xirr` in API und Typen): das ist die etablierte Bezeichnung der Funktion, wie sie auch in Tabellenkalkulationen heißt, und ein Umbenennen der Rechenschicht brächte keine Klarheit für den Leser der Oberfläche. |
| **Einzahlung** vs. **Kauf** vs. **Einstand** | Drei Fragen, drei Wörter: was ich *eingezahlt* habe (**Eingezahltes Kapital**, Geld von außen), was ich in Wertpapiere *gekauft* habe (**Nettokäufe**) und was die *heute gehaltenen* Anteile gekostet haben (**Einstand**, FIFO, in der Oberfläche **Investiertes Kapital**). Außerhalb dieser einen Bezeichnung stehen „Investition“, „investiert“ und „Sparrate“ in der Oberfläche nicht: sie meinten je nach Stelle eine der drei — „Sparrate“ zudem klang nach **Sparplan**, einer Wertpapier-Order. Code-Namen (`fluesse`, `sparrate`, `investitionsFluesse`) bleiben. |
| **Kursgewinn** vs. **Gesamtgewinn** | Zwei Begriffe, nicht zwei Namen für dieselbe Sache. Der **Kursgewinn** stellt die gehaltenen Wertpapiere ihrem Einstand gegenüber, der **Gesamtgewinn** den ganzen Depotwert dem eingezahlten Kapital; die Differenz sind realisierte Gewinne, Erträge, Steuern und Gebühren. Beide Zahlen stehen auf derselben Seite und weichen deshalb voneinander ab — jede trägt an ihrer Anzeigestelle einen Erklärtext, der die andere nennt. Im Code heißt das Modul der zweiten Größe weiterhin `core/kursgewinn.ts`: eine Umbenennung dort löst über INV-10 eine Kernversion aus, ohne dass sich etwas rechnet. [ADR-016] |
| **Sharpe-Ratio** | Bleibt englisch/mit Bindestrich — benannt nach William Sharpe, ein feststehender Fachbegriff der Finanzmathematik ohne gebräuchliche deutsche Entsprechung, wie TWR/FIFO. |
| **Maximum Drawdown** | Bleibt englisch; auf der Karte über dem Verlauf aus Platzgründen „Max. Drawdown“ — „maximaler Kapitalrückgang" existiert, wird in der Praxis aber nicht verwendet; „Drawdown" ist der etablierte Begriff unter Anlegern. |
| **ADR** | Bleibt als Akronym (*Architecture Decision Record*) — der Ordnername `docs/entscheidungen/` ist trotzdem deutsch, weil er zur Ordnerstruktur der Anwendung gehört; die Dateiform selbst ist eine Branchenkonvention. |
| **Fehler-Komposita** | `ApiFehler`, `FehlerCode` — ein deutsches Fachwort (`Fehler`) mit englischem technischen Bestimmungswort (`Api`, `Code`). Konsequent so gehalten, wenn das Bestimmungswort selbst ein Technikbegriff ohne gute deutsche Übersetzung ist. |

## Grundsatz für neue Begriffe

Bei einem neuen Begriff gilt diese Testfrage: Beschreibt das Wort etwas über
*dieses Depot* (eine Transaktion, eine Kennzahl, ein Zustand des Bestands) — dann deutsch.
Beschreibt es, *wie* die Software gebaut ist (eine Datenstruktur, ein Netzwerkkonzept, ein
Werkzeug) — dann englisch, wie es die Branche üblicherweise nennt. Im Zweifel entscheidet,
welche Formulierung ein Mensch, der das Depot versteht aber kein Softwareentwickler ist,
eher verstehen würde.
