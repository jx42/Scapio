# ADR-046: Footer-Link zur Readme

## Kontext

Der Footer nennt die Version und verlinkt die Versionen im Repository ([ADR-022](ADR-022-footer-links-scalable-und-repository.md)).
Wer die Anwendung bedient, sucht Anleitung und Erklärung aber in der Readme; die liegt nur im
Projektordner und auf GitHub.

## Entscheidung

Neben der Versionsnummer steht „Readme" mit Ziel `https://github.com/jx42/Scapio#readme`, unter
denselben Bedingungen wie in ADR-021/ADR-022. Der Eintrag in `ERLAUBTE_AUSGEHENDE_LINKS` ist auf
genau diese Adresse verankert. Der bisherige Link „Neue Version?" heißt jetzt „Versionen" — das
Ziel bleibt die Release-Seite. Die Version erscheint ohne Patch-Stelle („Version 1.0").

## Folgen

- Sechs ausgehende Ziele statt fünf; weiterhin kein automatischer Netzverkehr.
