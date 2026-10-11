/*
 * Laesst eine Zahl innerhalb eines fertig formatierten Strings vom alten zum neuen
 * Wert hoch- oder runterzaehlen, statt beim Aendern nur einmal aufzublitzen — die
 * Bewegung selbst zeigt an, dass und wie stark sich eine Kennzahl durch den letzten
 * Lauf veraendert hat.
 *
 * Arbeitet auf dem fertigen String, nicht auf der Rohzahl: `wert` kommt aus
 * `lib/format.ts` bereits formatiert herein — hier wird nicht zusaetzlich formatiert,
 * nur dieselbe Ziffernfolge mit denselben Nachkommastellen zwischen Start- und
 * Zielbetrag interpoliert. Vorzeichen, Waehrungs-/Prozentzeichen und der Rest des
 * Strings bleiben die des Zielwerts — nur die Ziffern selbst zaehlen.
 *
 * `zaehlerAnzeige` ist als reine Funktion exportiert, damit die Interpolation ohne
 * Timer und ohne rAF geprueft werden kann (siehe useZahlZaehler.test.ts) — der Hook
 * selbst bindet daran nur noch die Framezeit.
 */
import { useEffect, useRef, useState } from 'react';

import { bevorzugtWenigerBewegung } from '@/lib/bewegung';

const ZAHL_MUSTER = /([+\-−]?)(\d{1,3}(?:\.\d{3})*|\d+)(,\d+)?/;
const DAUER_MS = 700;

const formatCache = new Map<number, Intl.NumberFormat>();

function formatiereBetrag(betrag: number, nachkommastellen: number): string {
  let format = formatCache.get(nachkommastellen);
  if (format === undefined) {
    // eslint-disable-next-line no-restricted-syntax -- Zwischenwerte der Zaehl-Animation in der Nachkommastellenzahl der schon fertig formatierten Zielzahl, siehe Dateikopf.
    format = new Intl.NumberFormat('de-DE', {
      minimumFractionDigits: nachkommastellen,
      maximumFractionDigits: nachkommastellen,
    });
    formatCache.set(nachkommastellen, format);
  }
  return format.format(betrag);
}

function betragAus(treffer: RegExpMatchArray): number {
  const ganzzahl = (treffer[2] ?? '0').replace(/\./g, '');
  const nachkomma = treffer[3] === undefined ? '' : treffer[3].replace(',', '.');
  return Math.abs(Number(`${ganzzahl}${nachkomma}`));
}

function easeOutQuad(anteil: number): number {
  return 1 - (1 - anteil) * (1 - anteil);
}

/**
 * Zeigt `zielWert` bei `fortschritt >= 1` unveraendert an — Rundung darf dort nie
 * vom tatsaechlichen Zielstring abweichen. Darunter zaehlt nur die im Zielwert
 * gefundene Zahl vom Betrag aus `alterWert` hoch oder runter; alles drumherum
 * (Vorzeichen, Einheit, Text) kommt unveraendert aus `zielWert`. Enthaelt eine der
 * beiden Zeichenketten keine Zahl, oder sind beide gleich, wird nicht gezaehlt.
 */
export function zaehlerAnzeige(alterWert: string, zielWert: string, fortschritt: number): string {
  if (alterWert === zielWert || fortschritt >= 1) return zielWert;

  const treffer = zielWert.match(ZAHL_MUSTER);
  const altTreffer = alterWert.match(ZAHL_MUSTER);
  if (treffer === null || altTreffer === null) return zielWert;

  const start = betragAus(altTreffer);
  const ziel = betragAus(treffer);
  const nachkommastellen = treffer[3] === undefined ? 0 : treffer[3].length - 1;
  const aktuell = start + (ziel - start) * easeOutQuad(Math.max(0, fortschritt));

  const vorspann = zielWert.slice(0, treffer.index ?? 0);
  const nachspann = zielWert.slice((treffer.index ?? 0) + treffer[0].length);
  return `${vorspann}${treffer[1]}${formatiereBetrag(aktuell, nachkommastellen)}${nachspann}`;
}

/*
 * Ein gemeinsamer rAF-Treiber statt eines eigenen pro Instanz: Top25 haelt bis zu 25
 * Zeilen mit je drei gezaehlten Werten gleichzeitig, das waeren sonst bis zu 75
 * parallele requestAnimationFrame-Schleifen. Hier meldet sich jede Instanz nur als
 * Listener an einem einzigen laufenden Frame-Takt an.
 */
type FrameListener = (jetzt: number) => void;

const frameListener = new Set<FrameListener>();
let frameHandle: number | undefined;

function frameTick(jetzt: number) {
  frameHandle = undefined;
  for (const listener of frameListener) listener(jetzt);
  if (frameListener.size > 0) frameHandle = requestAnimationFrame(frameTick);
}

function anFrameTakt(listener: FrameListener): () => void {
  frameListener.add(listener);
  if (frameHandle === undefined) frameHandle = requestAnimationFrame(frameTick);
  return () => {
    frameListener.delete(listener);
  };
}

export function useZahlZaehler(wert: string): string {
  const vorheriger = useRef(wert);
  const [anzeige, setAnzeige] = useState(wert);

  useEffect(() => {
    const alterWert = vorheriger.current;
    vorheriger.current = wert;

    if (alterWert === wert || bevorzugtWenigerBewegung()) {
      setAnzeige(wert);
      return undefined;
    }

    const beginn = performance.now();

    const abmelden = anFrameTakt((jetzt) => {
      const fortschritt = (jetzt - beginn) / DAUER_MS;
      setAnzeige(zaehlerAnzeige(alterWert, wert, fortschritt));
      if (fortschritt >= 1) abmelden();
    });

    return abmelden;
  }, [wert]);

  return anzeige;
}
