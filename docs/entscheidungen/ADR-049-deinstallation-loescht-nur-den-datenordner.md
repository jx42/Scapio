# ADR-049: Deinstallation löscht nur den Datenordner

## Kontext

Die README beschrieb die Deinstallation in fünf Handschritten. Der heikelste davon ist der
Datenordner: Er liegt unter macOS in der ausgeblendeten `Library`, unter Windows in
`%LOCALAPPDATA%`, und `config.json` kann ihn umlenken. Wer ihn nicht findet, lässt Datenbank,
Sicherungen und die OAuth-Token bei Scalable liegen.

Gegen ein Skript, das „alles“ löscht, sprechen drei Dinge:

- Es ist die erste Funktion, die Nutzerdaten endgültig vernichtet. Ein verbogenes
  `datenverzeichnis` oder ein versehentlicher Doppelklick reicht.
- Unter Windows hält `cmd` die laufende `.bat` und ihren Ordner offen. Ein Skript, das
  seinen eigenen Projektordner löscht, bleibt dort halb stehen.
- Den MCP-Zugriff kann nur die Bank entziehen. Ein Aufruf, der dort etwas ändert, passt
  nicht zu einem Beobachter (INV-01).

## Entscheidung

`npm run deinstallieren` (`start/deinstallieren.ts`) mit `Deinstallieren.command` und
`Deinstallieren.bat` als Doppelklick-Hüllen. Das Skript löscht **nur das Datenverzeichnis**
und nennt danach die übrigen Schritte.

- Es bricht ab, wenn auf dem Port jemand hört.
- Es löscht nur, wenn jeder Eintrag im Ordner einer ist, den Scapio selbst anlegt (plus
  `.DS_Store`, `Thumbs.db`, `desktop.ini`). Ein einziger fremder Eintrag oder eine
  Verknüpfung statt eines Ordners: Abbruch, Löschen von Hand.
- Auf Wunsch sichert es die Datenbank vorher nach `~/Scapio-Sicherung/`, also ins
  Benutzerverzeichnis und nicht auf den Schreibtisch. Schreibtisch und Dokumente gleichen
  iCloud und OneDrive oft ab (ADR-005).
- Gelöscht wird erst, wenn jemand `ENTFERNEN` eintippt. Ohne Terminal läuft das Skript
  gar nicht, damit es keinen Weg gibt, der ohne Tippen löscht.
- Projektordner, MCP-Zugriff und Node.js bleiben Handschritte. Das Skript nennt sie am Ende.

## Folgen

- Neue Dateien im Datenverzeichnis müssen in `bekannteEintraege` stehen, sonst verweigert
  das Skript die Deinstallation. Das ist der gewollte, sichere Fehlschlag.
- Den Inhalt des Browser-`localStorage` (ausgeblendete Kacheln, Zeitraum) löscht das Skript
  nicht. Er enthält keine Depotwerte.
