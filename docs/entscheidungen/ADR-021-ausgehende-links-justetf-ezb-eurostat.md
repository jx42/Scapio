# ADR-021: Ausgehende Links zu onvista (ursprünglich justETF), EZB und Eurostat

> Ziel des ISIN-Links seit [ADR-028](ADR-028-onvista-statt-justetf.md): onvista statt justETF. Die Begründung unten zum geschlossenen Zeichenraum gilt unverändert. [ADR-022](ADR-022-footer-links-scalable-und-repository.md) ergänzt zwei feste Footer-Links; die Liste hat damit fünf Einträge.

## Kontext

Zwei Wünsche kollidieren mit INV-06 und INV-11, wörtlich gelesen: In Kachel 2 („Aufteilung")
soll jede Position eine Spalte „Details" mit einem Link zur ISIN bei justETF bekommen; im
Footer sollen die Datenquellen der Seite — Eurostat für die Inflation, die EZB für den Zins —
als Link statt als reiner Text stehen.

INV-06 verbietet, einen `href` aus einem Wert zu bauen — Begründung: Fremdtext von der Bank
oder von iShares ist ungeprüft, ein Name wie `<img src=x onerror=…>` darf nie zu einer
Adresse werden. INV-11 verbietet jede fremde Adresse im Frontend — Begründung: „Wer dieses
Dashboard öffnet, erzeugt keinen einzigen Netzverkehr, der diesen Rechner verlässt." Beide
Tests sind bewusst grob: sie verbieten das Muster, nicht nur den riskanten Fall, weil sich
„riskant" im Quelltext eines Grep-Tests nicht zuverlässig von „harmlos" unterscheiden lässt.

## Entscheidung

Beide Links kommen — als eng begrenzte, im Code markierte Ausnahme, nicht als Aufweichung der
Invarianten selbst. Die Regeln bleiben, wie sie sind; nur die drei betroffenen Zeilen sind
namentlich ausgenommen.

### ISIN-Link ist kein Fremdtext-Fall

Eine ISIN ist in diesem Projekt kein Fremdtext. `ingest/schema/grundlagen.ts` führt sie schon
heute als eigenen Typ `Isin`, getrennt von `Fremdtext` — mit dem Muster
`/^[A-Z]{2}[A-Z0-9]{9}\d$/`, zwölf Zeichen, geschlossener Zeichenraum. Was INV-06 verhindern
will — ein Wert mit `"`, `<`, `:`, `/` oder `&`, der aus der Ziel-Adresse ausbricht oder ein
`javascript:`-Schema einschleust — kann eine Zeichenkette, die dieses Muster besteht, nicht
sein. `src/lib/onvista.ts` prüft das Muster ein zweites Mal, lokal in der Oberfläche, bevor es
den `href` baut (`onvistaLink()`); besteht die ISIN die Prüfung nicht, gibt es keinen Link.
Diese zweite Prüfung *ist* die Bedingung der Ausnahme — nicht nur eine Dokumentation davon.

### Ein Klick ist kein Laden

INV-11 richtet sich gegen Netzverkehr, den das Öffnen der Seite selbst auslöst — eine
CDN-Schrift, ein Tracking-Pixel, ein automatischer Prefetch. Ein `<a href>`, den niemand
anklickt, lädt nichts; erst der bewusste Klick verlässt die Seite, und in dem Moment weiß die
Person, die geklickt hat, dass sie das Dashboard verlässt. Das ist derselbe Unterschied wie
zwischen einem eingebetteten Analytics-Skript und einem Lesezeichen im Browser. Die CSP
(`default-src 'self'`) schützt hier ohnehin nicht: sie blockiert `fetch`/Skripte/Fonts, aber
keine normale Anchor-Navigation.

### Was dagegen bewusst nicht mitkommt

- **Reverse Tabnabbing.** Jeder Link trägt `target="_blank"` und `rel="noopener noreferrer"` —
  sonst könnte die geöffnete Seite über `window.opener` den Ursprungstab umbiegen.
- **Referrer-Leck.** `noreferrer` verhindert zusätzlich, dass die lokale Adresse als
  `Referer`-Header bei onvista, der EZB oder Eurostat ankommt. Die ISIN selbst steht ohnehin
  sichtbar in der Ziel-Adresse — das lässt sich nicht verstecken, ohne den Link selbst
  aufzugeben.
- **Geschlossene Liste.** Erlaubt sind genau drei feste Adressen: `onvista.de` (Legende der Aufteilung, neben dem IZF, und ISIN-Spalte der
  Erklärung des Vergleichswerts im Verlauf; ISIN angehängt, beide über `OnvistaLink`), `data.ecb.europa.eu` (Footer und Erklärung des
  risikofreien Zinses) und `ec.europa.eu` (Footer), alle ohne angehängten Wert. Im Menü der
  Benchmark-Auswahl steht kein Link mehr: ein Link in einem `menuitem` ist ein Ziel im Ziel. Ein weiterer Eintrag braucht eine eigene ADR, keinen stillen Zusatz zur Liste.

## Umsetzung in den Invarianten-Tests

`test/invarianten/quellen.ts` kennt die Markierung `INV-AUSNAHME` schon: eine Zeile, die sie im
Kommentar trägt, zählt für `sucheImCode()` als geprüfter Sonderfall, kein Fund. Die drei
betroffenen Zeilen — `href={link}` in `AufteilungAnsicht.tsx`, die beiden statischen
`href="https://…"` in `App.tsx`, und die Zeile in `onvista.ts`, die die Ziel-Adresse baut —
tragen sie, mit Verweis auf diese ADR. Jede andere Zeile in `src/` bleibt unter dem vollen
Verbot.

Der einzige Test ohne diesen Mechanismus ist `inv-11.test.ts`s Prüfung des Bau-Ergebnisses
(„lässt nach dem Bauen keine fremde Adresse in `dist/` zurück") — sie liest kompilierten Code,
der keine Kommentare mehr trägt, und filtert bisher nur `127.0.0.1`/`localhost` heraus. Dort
steht jetzt zusätzlich eine geschlossene Liste dreier Adressmuster (`ERLAUBTE_AUSGEHENDE_LINKS`),
dieselben drei wie oben. In der Praxis griff dieser Filter beim Bauen nicht: React kompiliert
JSX-Attribute zu Objekteigenschaften (`href:"…"`), nicht zum literalen `href="…"`-Muster, nach
dem der Test sucht — er bleibt trotzdem als Vorsichtsmaßnahme stehen, falls sich das mit einem
künftigen Bau-Werkzeug ändert.

## Bewusst nicht gewählt

- **Freie ISIN-Eingabe für den Benchmark-Vergleich verlinken.** Die feste Liste `BENCHMARKS` ist
  verlinkt, eine freie Eingabe nicht — ein anderer Fall: dort käme die ISIN direkt von einer Nutzereingabe, nicht aus einer bereits über
  INV-12 geprüften API-Antwort. Bleibt offen für eine eigene Entscheidung, sollte die
  Benchmark-Auswahl über die feste Liste in `BENCHMARKS` hinauswachsen.
- **Die Invariantentexte selbst umschreiben** (wie ADR-012 es mit INV-08 tat). Nicht nötig:
  INV-06 verbietet `href` aus *Fremdtext*, und eine geprüfte ISIN ist das nicht; INV-11
  verbietet *geladene* Ressourcen, kein angeklicktes Ziel. Beide Regeln bleiben wörtlich
  richtig — nur ihre notwendig groben Tests brauchten die benannte Ausnahme.
- **Ein zentrales `externeLinks.ts`-Modul**, aus dem sowohl Komponenten als auch Tests die
  erlaubten Hosts importieren. Bei drei festen Adressen, von denen zwei nie einen Wert
  anhängen, wäre das eine Abstraktion für einen Fall, der noch keinen zweiten hat.

## Folgen

- `docs/SICHERHEIT.md`, Befundtabelle: neue Zeile für diesen Fall, mit Verweis hierher.
- Ein Angreifer, der INV-06/INV-11 über diese drei Zeilen umgehen wollte, bräuchte entweder
  eine ISIN-Zeichenkette außerhalb des geprüften Musters (nicht möglich, siehe oben) oder
  Schreibzugriff auf `src/` selbst — und hätte dann ohnehin jede andere Kontrolle im Projekt
  schon unterlaufen.
