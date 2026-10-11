# ADR-022: Footer-Links zu Scalable Capital und zum Repository

## Kontext

[ADR-021](ADR-021-ausgehende-links-justetf-ezb-eurostat.md) schließt die Liste der ausgehenden
Links auf drei Adressen; ein weiterer Eintrag braucht eine eigene ADR. Der Footer bekommt zwei:
die Quelle „Scalable Capital (Kurse)" und, neben der Versionsnummer, „Neue Version?" mit Ziel
im Git-Repository.

## Entscheidung

Beide Links kommen unter denselben Bedingungen wie in ADR-021: feste Adresse ohne angehängten
Wert, `target="_blank"` mit `rel="noopener noreferrer"`, Markierung `INV-AUSNAHME` in der Zeile,
Eintrag in `ERLAUBTE_AUSGEHENDE_LINKS` (`test/invarianten/inv-11.test.ts`). Die Liste hat damit
fünf Einträge.

- `https://scalable.capital` — Datenquelle der Kurse, wie Eurostat und EZB im Footer.
- `https://github.com/jx42/Scapio/releases` — Ziel von „Neue Version?".

„Neue Version?" ist ein Link, keine Prüfung: Die Anwendung fragt weder das Repository noch sonst
jemanden, ob es eine neuere Fassung gibt ([ADR-013](ADR-013-update-nur-auf-knopfdruck.md)).
Der Link erscheint immer, unabhängig vom Stand. Aktualisiert wird weiter nur per
`npm run update` auf Knopfdruck; eine Route dafür gibt es nicht [INV-08].

## Folgen

- Auch hier kein automatischer Netzverkehr: erst der bewusste Klick verlässt die Seite.
- `docs/SICHERHEIT.md`, Befundtabelle: die Zeile zu ADR-021 nennt die zwei Ziele mit.
