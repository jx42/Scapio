# ADR-035: ZIP als Standardweg der Installation, Git als Alternative

## Kontext

[ADR-013](ADR-013-update-nur-auf-knopfdruck.md) ließ die README für Updates den Git-Klon
empfehlen, weil nur dort `Aktualisieren.command`/`Aktualisieren.bat` wirklich aktualisieren.
Der Klon verlangt aber das Terminal, oft erst eine Git-Installation, und danach wissen viele
nicht, in welchem Ordner er gelandet ist. Für die Zielgruppe, die nie ein Terminal öffnet,
scheiterte die Installation damit am ersten Schritt.

## Entscheidung

Die README führt das ZIP als den einen Installationsweg. Der Git-Klon steht in einem
aufklappbaren Abschnitt für Fortgeschrittene. Das Update bleibt wie in ADR-013: per
Doppelklick nur beim Klon, beim ZIP von Hand, und `Aktualisieren.*` zeigt dort die Schritte.

Weil der ZIP-Weg jetzt der Standard ist, fangen die Startskripte seine typischen Fehler ab:
ein Start direkt aus der ZIP-Ansicht (`package.json` fehlt daneben) und ein fehlendes oder zu
altes Node (die Download-Seite öffnet sich im Browser).

## Verworfene Alternativen

- **Das ZIP-Update automatisieren.** Bleibt aus den Gründen in ADR-013 verworfen.
- **Git weiter empfehlen.** Ein bequemeres Update hilft niemandem, der die Installation
  nicht schafft.

## Folgen

- ZIP-Nutzer aktualisieren von Hand und sehen dabei die macOS-/Windows-Sicherheitswarnung
  erneut; der Klon trägt keine Quarantäne-Markierung und warnt nie.
- Wer bequem aktualisieren will, steigt einmal auf den Klon um. Die Daten liegen außerhalb des
  Projektordners ([ADR-005](ADR-005-datenbank-ausserhalb-des-projekts.md)) und bleiben dabei
  erhalten.
