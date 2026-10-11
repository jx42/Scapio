# Rechenkern

Reine Funktionen. Hier entstehen alle Zahlen, die das Dashboard zeigt.

## Regeln
- Kein I/O, kein `node:`-Import, kein `Date.now()`, kein `Math.random()`. Der heutige Tag
  ist ein Parameter. [INV-04]
- Geld ist `bigint` in Cent, Menge in 1e-8, Kurs in 1e-6. [INV-02]
- Gerundet wird ausschließlich in `dezimal.ts`, einmal am Ende einer Rechnung.
- Tage sind `YYYY-MM-DD` in Europe/Berlin, ausschließlich über `kalender.ts`. [INV-03]
- Funktionen geben Ergebnisobjekte zurück, keine Ausnahmen — auch nicht bei
  „keine Lösung“. Kein `NaN` verlässt diesen Ordner.

## Wenn du hier etwas änderst
Erst `KERN_VERSION` in `version.ts` erhöhen, dann `npm run abdruck` (schreibt den Hash in
`core/.abdruck.json`, gegen den `inv-10.test.ts` prüft). Der nächste Lauf rechnet die ganze
Historie neu — beabsichtigt. [INV-10]
