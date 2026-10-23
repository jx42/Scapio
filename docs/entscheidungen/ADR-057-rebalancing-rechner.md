# ADR-057: Rebalancing-Rechner als Rechnung, nicht als Empfehlung

Vorschlag in [`plans/rebalancing-rechner.md`](../../plans/rebalancing-rechner.md) (dort noch als
ADR-055 geführt; die Nummer war vergeben).

## Kontext

[PRODUCT.md](../../PRODUCT.md) schließt „Orders vorbereiten“ und „Empfehlungen“ aus. Ein
Rebalancing-Rechner nach dem Muster von Finanzfluss liegt an genau dieser Grenze: er sagt je
Position, wie viel bis zu einem Ziel fehlt. Gleichzeitig rechnet die Oberfläche nicht
([ARCHITEKTUR.md](../ARCHITEKTUR.md)), der Abzug der Demo kennt keine freien Anfragen
([ADR-048](ADR-048-demo-als-statischer-abzug.md)), und INV-08 erlaubt keine dritte mutierende Route.

## Entscheidung

- **Das Ziel setzt der Nutzer**, je ISIN plus eine eigene Zeile für das Verrechnungskonto. Scapio
  gibt keine Gewichte vor; „Gleich gewichten“ ist eine Eingabehilfe. Keine Gruppen über mehrere
  ETFs — ließe sich später ergänzen, ohne die Rechnung zu ändern.
- **Ausgabe ist der „Betrag zum Ziel“ in €**, dazu der Anteil danach. Keine Stückzahl, kein Ordertyp,
  kein Link zur Bank. Ein `InfoKnopf` sagt: „Rechnung zum Stand vom …, kein Kaufvorschlag; Kosten und
  Steuern sind nicht berücksichtigt.“
- **Gerechnet wird in `core/rebalancing.ts`** in Cent und Basispunkten, größter Rest für `Σ delta = 0`;
  „Ohne Verkäufe“ füllt das Kontoguthaben von unten auf (Water-Filling). Erreichbar über die lesende
  Route `GET /api/rebalancing?ziel=…&ohneVerkaeufe=0|1`. Die Ist-Werte holt der Server selbst; die
  Query trägt nur das Ziel. Ungültiges Ziel: `E_PARAMETER`.
- **Ein ISIN-Wechsel** ([ADR-053](ADR-053-stichtag-und-isin-wechsel-im-kern.md)) braucht keine eigene
  Zuordnung: die Kennzahlen führen nur die neue ISIN, ein gespeichertes Ziel für die alte erscheint
  als Position außerhalb des Depots.
- **Drift**: bei `banner` ein Hinweis, bei `abbruch` kein Ergebnis.
- **Das Ziel liegt im `localStorage`** (`portfolio.zielaufteilung`), geschrieben erst beim Berechnen.
  Eine verkaufte Position fällt heraus, eine neue beginnt bei 0 %, von Hand aufgenommene ISINs
  bleiben.
- **Im Demo-Abzug** gilt ein festes Beispielziel (`DEMO_REBALANCING_ZIEL` in `shared/demoAbzug.ts`),
  je eine Datei für mit und ohne Verkäufe. Die Felder sind dort gesperrt; in `npm run demo` ist der
  Rechner frei.

## Verworfene Alternativen

- **Rechnung in der Oberfläche** — bricht „die Oberfläche rechnet nicht“ und bringt Fließkomma in
  Geldbeträge (INV-02).
- **Ziel in der Datenbank** — bräuchte eine dritte schreibende Route (INV-08).
- **Ausgabe in Stück** — wäre ein Orderentwurf.

## Folgen

- `KERN_VERSION` 36.
- Der Abzug wächst um zwei Dateien.
- Wer mit dem Ergebnis handelt, tut das außerhalb von Scapio; Kosten, Steuern und Mindestordergrößen
  bleiben unberücksichtigt.
