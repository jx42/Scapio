# ADR-050: Zeitzonen in der CI nur unter Linux, ohne UTC

## Kontext

`pruefung.yml` fuhr `check` und `test:tz` (die Suite unter UTC, `America/Los_Angeles` und
`Pacific/Kiritimati`) auf macOS, Linux und Windows, also vier vitest-Läufe je Plattform.
Unter Windows kostet einer etwa 72 s, der Job dauerte 6:50 und bestimmte die Laufzeit.

- Die gehosteten Runner stehen auf UTC. Der UTC-Lauf von `test:tz` wiederholte `check`.
- Node bringt sein eigenes ICU mit und wertet `TZ` auf allen drei Systemen gleich aus.
  Ein Zeitzonenfehler, der nur unter Windows auftritt, ist nicht zu erwarten.
- Die beiden fremden Zonen fangen je eine eigene Fehlerart: westlich von UTC ein Datum,
  das als UTC gelesen und in Ortszeit ausgegeben wird; östlich davon eines, das in Ortszeit
  gebaut und als UTC ausgegeben wird.

## Entscheidung

- `check` läuft weiter auf allen drei Plattformen.
- Ein eigener Job `zeitzonen` fährt parallel dazu unter Linux nur `America/Los_Angeles` und
  `Pacific/Kiritimati`. `start/zeitzonen.ts` nimmt die Zonen als Argumente und lehnt eine
  unbekannte ab, weil Node sonst still auf UTC zurückfiele.
- Lokal bleibt `npm run test:tz` bei allen drei Zonen: Dort ist die Ortszeit Berlin, und
  `check` sieht diese Fehler gar nicht.
- INV-03 verbietet zusätzlich statisch `new Date(…, …)`, `toLocale(Date|Time)String` ohne
  Optionen und jedes `Intl.DateTimeFormat` ohne `timeZone`. Damit fallen beide Fehlerarten
  schon beim Schreiben auf, die Zeitzonenläufe sind die zweite Linie.
- Nebenbei: In der CI baut nur `vite build` (den Typecheck macht `check`), und ein neuer Push
  auf einen Pull Request bricht dessen alten Lauf ab.

## Folgen

- Der Gesamtlauf sinkt von rund 7 auf rund 3 Minuten, Windows ist weiter der längste Job.
- Ein Zeitzonenfehler, der nur auf macOS oder Windows auftritt, fiele in der CI nicht auf.
  Wer `core/kalender.ts` oder `src/lib/format.ts` ändert, fährt `npm run test:tz` lokal.
