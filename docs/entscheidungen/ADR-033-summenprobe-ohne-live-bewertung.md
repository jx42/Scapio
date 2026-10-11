# ADR-033: Summenprobe nicht gegen eine Live-Bewertung

## Kontext

[ADR-015](ADR-015-summenprobe-nur-bei-gleichem-stand.md) vergleicht nur, wenn kein Kurs
jünger ist als der Stand der Bank — unter der Annahme, dass die Bank ihren Gesamtwert nur
gelegentlich neu rechnet. Für `get_portfolio_performance` galt das. Das seit
[ADR-032](ADR-032-gesamtwert-aus-portfolio-overview.md) genutzte `get_portfolio_overview`
bewertet während des Handels aber **live**: `valuationTimestampUtc` ist der Moment des
Aufrufs, Sekunden nach den Kursen aus `holdings`. Die Bedingung ist dann immer erfüllt,
obwohl beide Seiten verschiedene Momente beschreiben.

Beobachtet am 28.09.2026, 21:21 (gettex offen): zwei Läufe im Abstand von 35 s mit
+3,71 € und −4,13 € Abweichung bei den Wertpapieren, Kontostand exakt. Am Sonntag davor,
Bewertung auf den Freitagsschluss eingefroren: −0,01 €.

## Entscheidung

`Vergleichsstand` trägt zusätzlich `laufAb`, den Beginn des Laufs. Liegt der Stand der
Bank nicht vor `laufAb`, ist er eine Live-Bewertung, und die Zeile schweigt. Sonst gilt
ADR-015 unverändert. Fehlt `laufAb` oder ist er unlesbar, wird wie bisher verglichen.

## Verworfene Alternativen

- **Relative Toleranz** — aus demselben Grund wie in ADR-015 verworfen.
- **Kurse und Gesamtwert gleichzeitig abrufen und ein Fenster von Sekunden erlauben.** Auch
  Sekunden reichen im Handel für mehr als 1 €; die Zeile würde weiter rauschen.

## Folgen

- Während des Handels prüft die Zeile nichts mehr, nach Handelsschluss und am Wochenende
  weiterhin auf den Cent — dann, wenn die Bank ihren Stand eingefroren hat.
- `pruefeSummen` bleibt rein: `laufAb` kommt als Wert herein, nicht von der Uhr.
