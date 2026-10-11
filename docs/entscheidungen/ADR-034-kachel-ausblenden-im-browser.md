# ADR-034: Kachel ausblenden im Browser, einblenden nur über die Adresse

> **Abgelöst durch [ADR-038](ADR-038-top25-nur-auf-wunsch.md).** Die Top 25 erscheinen nur
> noch, wenn jemand sie einschaltet. Damit ist das Menü entfallen, samt `?kacheln=alle`.

## Kontext

Die Kachel „Top 25 Unternehmen" bleibt für jemanden ohne passende ETFs dauerhaft leer. Sie
soll sich über ein „…"-Menü ausblenden lassen. Wieder einblenden soll möglich, aber nicht
Teil der Oberfläche sein, damit ein zweites Bedienelement für einen seltenen Fall nicht
dauerhaft Platz braucht.

## Entscheidung

Die ausgeblendeten Kachel-IDs stehen im localStorage (`portfolio.kacheln-ausgeblendet`,
`useKachelAusgeblendet` in `src/lib/speicher.ts`). Wieder eingeblendet wird mit
`?kacheln=alle` in der Adresse: `kachelnZuruecksetzen` leert beim Start die Liste und
entfernt den Parameter aus der Adresse. Nach dem Ausblenden nennt ein Toast diesen Weg.

## Verworfene Alternativen

- **Einstellungsdatei im Datenverzeichnis, vom Server geschrieben.** Das bräuchte eine dritte
  mutierende Route, und INV-08 und [ADR-012](ADR-012-anmeldeknopf-als-zweite-mutierende-route.md)
  schließen die Liste.
- **Einstellungsdatei, die nur von Hand bearbeitet wird.** Dann könnte der Menüeintrag selbst
  nichts ausblenden.

## Folgen

- Die Einstellung gilt je Browser. Ein anderer Browser oder ein privates Fenster zeigt die
  Kachel wieder, und gelöschte Websitedaten blenden sie ebenfalls wieder ein.
- Weitere Kacheln bekommen das Menü mit `onAusblenden` an `<Kachel>` und
  `useKachelAusgeblendet(id)`. Ihre Rasterzelle in `App.tsx` braucht dann `empty:hidden`.
