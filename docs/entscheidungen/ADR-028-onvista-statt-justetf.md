# ADR-028: onvista statt justETF als Ziel des ISIN-Links

## Kontext

Der ISIN-Link ([ADR-021](ADR-021-ausgehende-links-justetf-ezb-eurostat.md)) führte zu justETF.
justETF kennt nur ETFs und Aktien; Fonds und Krypto-ETPs landen auf einer leeren Suche, und
`stock-profiles/<ETF-ISIN>` gibt 404. Der Link musste die Art kennen ([ADR-025](ADR-025-wertpapierart-per-get-security-quote.md)),
und Fonds bekamen keinen.

## Entscheidung

Alle Links gehen auf `https://www.onvista.de/suche?searchValue=<ISIN>`. onvista leitet die
Suche auf die Produktseite weiter: ETF, Aktie, Fonds, ETC/ETP und Anleihe. Ein Link für jede
Art, keine Fallunterscheidung.

- Die Adresse hängt wie zuvor nur an der geprüften ISIN (geschlossener Zeichenraum,
  `src/lib/onvista.ts`); INV-06 bleibt über die ADR-021-Ausnahme gewahrt.
- Die Art dient nur noch der Anzeige (Spalte „Art").
- INV-11: `ERLAUBTE_AUSGEHENDE_LINKS` erlaubt `www.onvista.de` statt `justetf.com`.

## Folgen

- Die Such-URL ist nicht als stabile Schnittstelle zugesagt; ändert onvista sie, landet der
  Klick auf einer Suchseite, ohne dass die Anwendung etwas merkt. Ein Link, kein Abruf.
- onvistas Produktseiten zeigen für ETFs weniger (TER, Look-Through) als justETF.
