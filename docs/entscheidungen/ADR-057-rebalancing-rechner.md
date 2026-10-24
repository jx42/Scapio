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

- **Das Ziel setzt der Nutzer**, je Position im Depot plus eine Zeile „Bargeld (Verrechnungskonto)“.
  Scapio gibt keine Gewichte vor, auch keine Eingabehilfe dafür. Keine Gruppen über mehrere ETFs —
  ließe sich später ergänzen, ohne die Rechnung zu ändern.
- **Jede Zeile lässt sich ausschließen.** Sie bleibt, wie sie ist, und zählt weder zum
  aufzuteilenden Wert noch zur 100-%-Summe. Die Query trägt nur die einbezogenen Zeilen; was im
  Depot, aber nicht im Ziel steht, ist ausgeschlossen.
- **Ausgabe ist der „Betrag zum Ziel“ in €.** Keine Stückzahl, kein Ordertyp, kein Link zur Bank.
- **Beim Öffnen wird sofort gerechnet**, wenn das gemerkte Ziel 100 % ergibt — mit den Ist-Werten
  des letzten Laufs.
- **Gerechnet wird in `core/rebalancing.ts`** in Cent und Basispunkten, größter Rest für `Σ delta = 0`.
  Erreichbar über die lesende Route `GET /api/rebalancing?ziel=…`. Die Ist-Werte holt der Server
  selbst; die Query trägt nur das Ziel. Ungültiges Ziel: `E_PARAMETER`.
- **Ein ISIN-Wechsel** ([ADR-053](ADR-053-stichtag-und-isin-wechsel-im-kern.md)) braucht keine eigene
  Zuordnung: die Kennzahlen führen nur die neue ISIN, das gespeicherte Ziel der alten fällt heraus.
- **Drift**: bei `banner` ein Hinweis, bei `abbruch` kein Ergebnis.
- **Das Ziel liegt im `localStorage`** (`portfolio.zielaufteilung`), samt der ausgeschlossenen
  Zeilen, geschrieben erst beim Berechnen. Eine verkaufte Position fällt heraus, eine neue beginnt
  bei 0 %; eine ausgeschlossene Zeile behält ihr Ziel für das nächste Einbeziehen.
- **Der Knopf steht unter dem Ring**, nicht in der Titelzeile: er öffnet ein Werkzeug, keinen Hinweis.
- **Im Demo-Abzug** gilt ein festes Beispielziel (`DEMO_REBALANCING_ZIEL` in `shared/demoAbzug.ts`).
  Felder und Auswahl sind dort gesperrt; in `npm run demo` ist der Rechner frei.

## Verworfene Alternativen

- **Rechnung in der Oberfläche** — bricht „die Oberfläche rechnet nicht“ und bringt Fließkomma in
  Geldbeträge (INV-02).
- **Ziel in der Datenbank** — bräuchte eine dritte schreibende Route (INV-08).
- **Ausgabe in Stück** — wäre ein Orderentwurf.
- **„Ohne Verkäufe“, „Gleich gewichten“, freie ISIN außerhalb des Depots** — zugunsten einer
  schlichten Eingabe weggelassen. Die Route nimmt eine ISIN außerhalb des Depots weiter an
  (`imDepot: false`); die Oberfläche bietet sie nicht an.

## Folgen

- `KERN_VERSION` 36.
- Der Abzug wächst um eine Datei.
- Wer mit dem Ergebnis handelt, tut das außerhalb von Scapio; Kosten, Steuern und Mindestordergrößen
  bleiben unberücksichtigt.
