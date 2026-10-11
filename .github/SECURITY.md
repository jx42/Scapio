# Sicherheit

## Melden

Eine Schwachstelle bitte **nicht** als öffentliches Issue melden, sondern über
[GitHub Security Advisories](https://github.com/jx42/Scapio/security/advisories/new)
(„Report a vulnerability" auf dem Tab „Security" dieses Repositories). Das legt eine private
Diskussion an, bis ein Fix bereitsteht.

Antwort innerhalb von 7 Tagen. Ist ein Fund bestätigt, folgt ein Fix vor der Veröffentlichung
des Advisories; ist er nicht reproduzierbar oder außerhalb des Geltungsbereichs, steht das
ebenfalls in der Rückmeldung.

## Geltungsbereich

Betroffen sind Code und Konfiguration in diesem Repository — insbesondere die zwölf
Invarianten in [AGENTS.md](/AGENTS.md) und das Bedrohungsmodell in
[docs/SICHERHEIT.md](/docs/SICHERHEIT.md).

Außerhalb des Geltungsbereichs:

- Schwachstellen in Abhängigkeiten aus `node_modules/` ohne einen Bezug zu diesem Projekt —
  die gehören an das jeweilige Paket, `npm audit` findet sie automatisch.
- Der Scalable-Capital-MCP-Server selbst, dessen offizielle Authentifizierung und API — das
  liegt außerhalb dieses Repositories.
- Die beiden in [docs/SICHERHEIT.md](/docs/SICHERHEIT.md) unter „Bewusst getragene
  Restrisiken" benannten Punkte (DNS-Rebinding-Fenster in `ingest/netz.ts`, wirkungslose
  POSIX-Dateirechte unter Windows) sind bekannt und bewusst nicht behoben — ein Advisory dazu
  bringt nichts Neues, ein Kommentar oder eine Diskussion aber schon.
