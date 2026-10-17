# ADR-052: Demo-Band mit Link zum Repository

## Kontext

Die öffentliche Demo ([ADR-048](ADR-048-demo-als-statischer-abzug.md)) wird meist von außen
geöffnet, oft auf dem Handy. Dort fehlte ein sichtbarer Hinweis, dass die Zahlen erfunden sind
und wo das Projekt liegt; der Zusatz „(Demo)“ im Titel und die Footer-Links reichen dafür nicht.

## Entscheidung

Nur im Demo-Modus (`istDemoModus()`) steht über dem Kopf ein schmales Band: ein Satz, dass es die
Demo mit erfundenen Daten ist, und ein Link „Scapio auf GitHub“ auf `https://github.com/jx42/Scapio`.
Der Eintrag in `ERLAUBTE_AUSGEHENDE_LINKS` ist auf genau diese Adresse verankert; Bedingungen wie
in ADR-021/ADR-022 (`target="_blank"`, `rel="noopener noreferrer"`, kein automatischer Abruf).
Das Band ist sticky, damit der Hinweis bei jeder Zahl sichtbar bleibt; unter `sm` steht eine
einzeilige Kurzfassung, und `scroll-padding-top` hält Sprungziele frei (WCAG 2.4.11).

## Folgen

- Sieben ausgehende Ziele statt sechs. In einem echten Lauf erscheint das Band nie, das Ziel
  steht aber im ausgelieferten Bundle.
