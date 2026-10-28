# Product

<!-- impeccable:product-schema 1 -->

Was Scapio ist, für wen, und was es nie wird. Das Aussehen steht in [DESIGN.md](DESIGN.md), die Technik in [docs/ARCHITEKTUR.md](docs/ARCHITEKTUR.md). Die Überschriften folgen dem Schema der Design-Skills und bleiben deshalb englisch.

## Platform

web — eine lokale Seite auf `127.0.0.1`, geöffnet im Browser unter macOS oder Windows.

## Users

Privatanleger mit **einem** Depot bei Scalable Capital, überwiegend ETF-Sparpläne, dazu
Einzelkäufe. Wer Scapio nutzt, will wissen, wie es seinem Geld wirklich geht. Handeln will er
damit nicht. Er schaut gelegentlich hinein, etwa monatlich oder nach einem Marktereignis. Ein
Terminal muss er nicht kennen: Er startet per Doppelklick und meldet sich einmal per Knopf an.
Mit Begriffen wie TWR oder Drawdown ist er nicht unbedingt vertraut.

## Product Purpose

Die App von Scalable zeigt Depotwert und Tagesbewegung. Scapio beantwortet die Fragen, die
die App offenlässt:

1. **Was bleibt real übrig?** IZF und Realrendite nach Inflation (Eurostat-HVPI).
2. **Schlage ich den Markt?** Dieselben Ein- und Auszahlungen, am selben Tag in einen
   Vergleichs-ETF gesteckt ([ADR-020](docs/entscheidungen/ADR-020-benchmark-vergleich-etf-nav-und-echte-fluesse.md)).
3. **Wie unruhig ist mein Depot?** Volatilität, maximaler Drawdown, Sharpe-Ratio
   ([ADR-009](docs/entscheidungen/ADR-009-risikokennzahlen.md)).
4. **Worin bin ich wirklich investiert?** Der Blick durch die ETFs auf Unternehmen, Länder und Sektoren
   (Länder & Sektoren und Unternehmen, nur auf Wunsch, [ADR-038](docs/entscheidungen/ADR-038-top25-nur-auf-wunsch.md),
   [ADR-058](docs/entscheidungen/ADR-058-laender-und-sektoren-neben-den-unternehmen.md)).
5. **Was hat mich das gekostet, was hat es gebracht?** Erträge, Steuern und Gebühren einzeln.

Gelungen ist Scapio, wenn jemand nach einem Blick auf die Seite eine dieser Fragen
beantworten kann, ohne nachzurechnen, und der Zahl vertraut.

## Positioning

Die ganze Historie wird lokal aus den eigenen Buchungen rekonstruiert. Gerechnet wird in
Cent ohne Fließkomma, verglichen mit echten Fondskursen statt mit Indexständen. Es gibt kein
Konto, keine Cloud, und die Bank sieht kein Drittsystem. Ein Portfolio-Tracker mit Server
kann das so nicht anbieten.

## Operating Context

- Der Start erfolgt per Doppelklick (`Start.command`/`.bat`). Gebaut wird nur bei
  Bedarf, danach öffnet sich der Browser.
- Neue Daten holt nur der Knopf „Aktualisieren“, und zwar lesend über den Scalable-MCP.
  Zwischen zwei Läufen ändert sich keine Zahl.
- Die Anmeldung erfolgt einmal per OAuth im Browser. Läuft sie ab, bietet die Seite selbst
  die erneute Anmeldung an.
- Ein Update gibt es nur auf Knopfdruck (`Aktualisieren.command`/`.bat`,
  [ADR-013](docs/entscheidungen/ADR-013-update-nur-auf-knopfdruck.md)).
- Eine öffentliche Demo mit erfundenen Daten zeigt das Produkt ohne Depot
  ([ADR-048](docs/entscheidungen/ADR-048-demo-als-statischer-abzug.md)).

## Capabilities and Constraints

Eine Seite mit sieben Kacheln, ohne Navigation. Jede Kachel beantwortet eine Frage:

| Kachel | Frage | Zeigt | Bewusst nicht |
|---|---|---|---|
| Verlauf | Wie hat sich mein Vermögen entwickelt, und wie stünde ich mit dem Vergleich? | Depotwert und eingezahltes Kapital oder Gesamtgewinn in %, Zeitraum 1W bis MAX oder frei per Regler, Vergleichslinie, Marken für Käufe, Verkäufe und Erträge. Darüber Karten mit Depotwert, Kursgewinn, Marktrendite p.a., Realrendite, Max. Drawdown und Sharpe | einen TWR-Chart ([ADR-011](docs/entscheidungen/ADR-011-kursgewinn-statt-twr-in-kachel-1.md)); der Gewinn zählt ab Fensterbeginn ([ADR-023](docs/entscheidungen/ADR-023-verlauf-zaehlt-ab-fensterbeginn.md)) |
| Aufteilung | Worauf verteilt sich das Geld? | Ring und Tabelle der Positionen samt Verrechnungskonto, Link zu onvista; Rebalancing-Rechner: Betrag zum selbst gesetzten Ziel, kein Kaufvorschlag ([ADR-057](docs/entscheidungen/ADR-057-rebalancing-rechner.md)) | Sektoren, Länder (stehen in „Länder & Sektoren“) |
| Kennzahlen | Wie gut, wie riskant, wie teuer? | Investiertes Kapital, Kursgewinn, realisierte Gewinne, Erträge, Steuern, Gebühren, TWR, IZF, Inflation, Realrendite, Risiko, Sparrate | Werte, die auf zu wenigen Daten beruhen (Volatilität und Sharpe erst ab 13 Monaten) |
| Länder & Sektoren, Unternehmen (optional, zwei Karten) | In welchen Unternehmen, Ländern und Sektoren stecke ich über alle ETFs? | Länder und Sektoren je als Ring mit den zehn größten Gruppen, daneben die Top 25 als kompakte Tabelle, Fonds je Unternehmen bei Hover; fehlende Fonds benannt | Abrufe bei Fondsanbietern, solange der Schalter aus ist |
| Woher kommt der Gewinn? | Welche Positionen und Töpfe tragen den Gesamtgewinn? | Sankey: Gewinne und Erträge links, rechts Verlustpositionen, Steuern, Gebühren und Nettogewinn; darüber Brutto, Abzüge und Netto | Zeitfenster; gezählt wird seit dem ersten Kauf |
| Käufe & Verkäufe | Wie viel investiere ich? | Investition je Monat, Durchschnitt ([ADR-008](docs/entscheidungen/ADR-008-fluesse-kachel-zeigt-investition-statt-einzahlung.md)) | Einzahlungen aufs Konto |
| Sparpläne | Was läuft automatisch? | Aktive Sparpläne | Bearbeiten, Anlegen, Löschen |

Begriffe stehen in [docs/GLOSSAR.md](docs/GLOSSAR.md). Zwei Zahlen dürfen nie verwechselt werden: Der **Gesamtgewinn** (Verlauf) enthält Konto, Erträge, Steuern und Gebühren, der **Kursgewinn** (Kennzahlen) nur die gehaltenen Wertpapiere ([ADR-016](docs/entscheidungen/ADR-016-gesamtgewinn-statt-kursgewinn-im-verlauf.md)).

**Nicht-Ziele**, auch auf Nachfrage nicht:

- Handeln, Sparpläne ändern, Orders vorbereiten. Scapio ist Beobachter, kein Akteur.
- Ein zweites Depot, eine zweite Bank, eine Steuererklärung.
- Prognosen, Empfehlungen, Bewertungen einzelner Wertpapiere, Benachrichtigungen.
- Ein Konto, eine Cloud, Analytics, ein Hintergrunddienst, ein Selbst-Update.
- Eine Mobile-App. Die Seite funktioniert aber ab 375 px Breite.

Die technischen Grenzen (Invarianten, Routen, Allowlist) stehen in [AGENTS.md](AGENTS.md).

## Brand Commitments

- **Name**: Scapio. Ein Community-Projekt, kein Produkt von Scalable Capital. Das steht in
  README und Footer. Weder das Logo noch die Markenfarben von Scalable werden verwendet.
- **Sprache**: Deutsch, Leser per „du“. Fachvokabular deutsch, Grenzfälle im Glossar.
  Alle Texte stehen in `src/i18n/de.ts`.
- **Ton**: sachlich, ruhig, ohne Ausrufezeichen und ohne Werbung. Eine Fehlermeldung sagt,
  was nicht ging, was das für die Zahlen bedeutet und was man tun kann.
- **Jede Zahl ist erklärbar.** Hinter Kennzahlen und Gewinnzahlen steht ein `InfoKnopf`
  mit Formel in Worten und dem Unterschied zur verwechselbaren Nachbarzahl.

## Evidence on Hand

- Ein Screenshot mit Demodaten liegt unter `docs/bilder/scapio-demo.png`. Die Demodaten
  (`npm run demo`) sind erfunden.
- Mit `npm run edgecases` zeigt eine Seite jede Fehlermeldung und jeden Randfall.
- Nutzerstimmen, Zahlen zur Nutzung oder Testimonials gibt es nicht und werden nicht erfunden.
  Echte Depotwerte gelangen nie in Doku, Screenshots oder Agentenkontext
  ([ADR-042](docs/entscheidungen/ADR-042-agenten-lesen-keine-depotwerte.md)).

## Product Principles

1. **Lieber leer als falsch.** Eine Zahl erscheint nur, wenn sie belastbar ist. Sonst steht dort ein Strich mit Begründung. Eine Abweichung zur Bank meldet der Drift-Banner.
2. **Ehrlicher Vergleich.** Verglichen wird mit erreichbaren Fondskursen inklusive Kosten, auf denselben Flüssen. Ein schöngerechneter Index ist kein Maßstab.
3. **Nichts verlässt den Rechner.** Was eine fremde Gegenstelle braucht, wird begründet (ADR) oder weggelassen.
4. **Ruhe statt Ticker.** Zahlen ändern sich nur durch einen Lauf, den der Nutzer auslöst. Es gibt kein Live-Polling und keine Push-Meldung.
5. **Eine Seite reicht.** Was nicht untereinander auf eine Seite passt, gehört nicht ins Produkt.

## Accessibility & Inclusion

WCAG 2.2 AA: Kontraste werden aus den Tokens nachgerechnet, axe läuft im E2E-Test. Jeder Chart
hat eine Tabellenalternative, Gewinn und Verlust werden nie allein über Farbe angezeigt,
alles ist per Tastatur bedienbar und reduzierte Bewegung wird respektiert. Details stehen in
[docs/BARRIEREFREIHEIT.md](docs/BARRIEREFREIHEIT.md).
