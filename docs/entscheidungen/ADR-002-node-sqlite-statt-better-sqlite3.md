# ADR-002: `node:sqlite` statt `better-sqlite3`

## Kontext

Die Anwendung braucht eine synchrone, eingebettete SQL-Datenbank ohne eigenen Server-Prozess
— SQLite ist dafür die naheliegende Wahl. Der etablierte Zugriffsweg aus Node heraus war
lange `better-sqlite3`: schnell, synchron, aber ein natives Addon, das bei jeder
`npm install` gegen die jeweilige Node-Version und Plattform kompiliert (oder als
vorkompiliertes Binary heruntergeladen) werden muss.

Das widerspricht zwei Zielen dieses Projekts direkt: `npm ci --ignore-scripts` als
Installationsweg (siehe `AGENTS.md`) verhindert genau die Install-Skripte, über die native
Module normalerweise nachgebaut werden — und jedes heruntergeladene, vorkompilierte Binary
ist zusätzliche Lieferkette, die geprüft werden müsste.

Node 24 bringt mit `node:sqlite` ein eingebautes, synchrones SQLite-Modul mit, das für die
Anforderungen dieser Anwendung (kein Concurrent-Writer-Setup, keine Erweiterungen, keine
exotischen Pragmas) ausreicht.

## Entscheidung

`db/verbindung.ts` verwendet ausschließlich `node:sqlite`. Das setzt Node ≥ 24 voraus
(siehe `AGENTS.md`, `package.json` `engines`), ist aber der einzige Weg, mit dem
`npm ci --ignore-scripts` auf jeder unterstützten Plattform ohne Compiler-Toolchain
funktioniert.

## Folgen

- Keine native Abhängigkeit im gesamten Projekt — eine ganze Klasse von
  Lieferketten-Risiken (kompromittiertes vorkompiliertes Binary, fehlschlagender Build auf
  einer neuen macOS-/Node-Version) entfällt ersatzlos.
- Harte Untergrenze Node ≥ 24 — auf älteren Node-Versionen startet die Anwendung nicht.
  Das ist eine bewusste Einschränkung, keine Nebenwirkung.
- `node:sqlite` ist jünger und weniger feature-reich als `better-sqlite3` (z. B. keine
  eigenen Erweiterungsfunktionen). Für die Anforderungen dieser Anwendung — einfache
  Tabellen, vorbereitete Statements, eine Backup-API für `db/verbindung.ts`s `sichern()` —
  reicht der Funktionsumfang vollständig aus.
