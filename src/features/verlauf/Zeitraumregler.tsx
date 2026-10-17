/*
 * Der frei gewaehlte Zeitraum: zwei Griffe ueber jedem Tag der Reihe.
 *
 * Die Stufen sind die Tage aus `/api/zeitreihe` (`tage`), nicht eine eigene Datumsrechnung —
 * die Oberflaeche zaehlt keine Kalendertage. [INV-03] Gefragt wird erst beim Loslassen, mit
 * der Tastatur erst nach einer kurzen Pause (`TASTEN_PAUSE_MS`) — sonst holte jeder Tastendruck
 * auf dem Weg eine Reihe. Bis dahin meldet `onVorschau` den Stand der Griffe, das Chart
 * zeichnet ihn.
 *
 * Kommt von aussen ein neues Fenster (Segmentleiste, neue Reihe), uebernimmt der Regler es
 * noch im Rendern statt per `key` neu zu mounten — nur so gleiten die Griffe per CSS an die
 * neue Stelle. Beim Ziehen gleitet nichts (`data-ziehen`), sonst hinkten sie dem Zeiger nach.
 *
 * Mit dem Zeiger gewaehlt wird beim Verlust des Pointer-Capture, nicht in `onValueCommit`:
 * Radix vergleicht dort die Werte des letzten Renders und meldet nichts, wenn der Capture
 * ohne `pointerup` endet — dann stuende die Vorschau, und das Chart zoomte nie.
 *
 * Gesperrt (Demo) nennt ein Popover den Grund, beim Ueberfahren mit der Maus und beim Tippen —
 * wie am Aktualisieren-Knopf kein Tooltip, der oeffnet auf Touchgeraeten nie. Gesperrte Griffe
 * nehmen keinen Fokus; Screenreadern nennt ihn `aria-describedby`.
 */

import { useEffect, useId, useRef, useState, type ReactNode } from 'react';

import { de } from '@/i18n/de';
import { datumKurz } from '@/lib/format';
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover';
import { Slider, SliderThumb } from '@/components/ui/slider';

export type ZeitraumreglerProps = {
  readonly tage: readonly string[];
  /** Wechselt, sobald die Griffe dem gezeigten Fenster folgen muessen — auch beim selben Fenster. */
  readonly fenster: string;
  readonly von: string;
  readonly bis: string;
  /** Gezeigt, aber nicht bedienbar; den Grund nennt ein Popover. */
  readonly gesperrt: boolean;
  readonly onWahl: (von: string, bis: string) => void;
  /** Stufen der Griffe beim Ziehen; `null`, sobald sie wieder auf dem gezeigten Fenster stehen. */
  readonly onVorschau: (vorschau: { readonly von: number; readonly bis: number } | null) => void;
};

const TASTEN_PAUSE_MS = 300;

/** Stufe des Tages; ein Tag ausserhalb der Reihe faellt auf den Rand. */
function stufe(tage: readonly string[], tag: string): number {
  const i = tage.findIndex((t) => t >= tag);
  return i === -1 ? tage.length - 1 : i;
}

export function Zeitraumregler({ tage, fenster, von, bis, gesperrt, onWahl, onVorschau }: ZeitraumreglerProps) {
  const ausgangA = stufe(tage, von);
  const ausgangB = stufe(tage, bis);
  const [stand, setStand] = useState({ fenster, griffe: [ausgangA, ausgangB] as const });
  const [ziehen, setZiehen] = useState(false);
  // Refs statt State: beide werden im selben Event gelesen, in dem sie gesetzt werden.
  const zeiger = useRef(false);
  const gezogen = useRef<readonly [number, number]>([ausgangA, ausgangB]);
  const tastenPause = useRef<ReturnType<typeof setTimeout>>(undefined);
  const grundId = useId();

  // Ein neues Fenster oder das Aushaengen verwirft die Wahl, die noch auf das Ende der Pause wartet.
  useEffect(
    () => () => {
      clearTimeout(tastenPause.current);
    },
    [fenster],
  );

  let griffe = stand.griffe;
  if (stand.fenster !== fenster) {
    griffe = [ausgangA, ausgangB];
    setStand({ fenster, griffe });
  }

  const [a, b] = griffe;
  const tagA = tage[a] ?? von;
  const tagB = tage[b] ?? bis;

  function waehle(neuA: number, neuB: number) {
    const neuVon = tage[neuA];
    const neuBis = tage[neuB];
    if (neuVon !== undefined && neuBis !== undefined && (neuA !== ausgangA || neuB !== ausgangB)) onWahl(neuVon, neuBis);
    else onVorschau(null);
  }

  const regler = (
    <Slider
      aria-label={de.verlauf.reglerBezeichnung}
      min={0}
      max={tage.length - 1}
      step={1}
      minStepsBetweenThumbs={1}
      disabled={gesperrt}
      value={[a, b]}
      data-ziehen={ziehen ? '' : undefined}
      onPointerDown={() => {
        if (gesperrt) return;
        clearTimeout(tastenPause.current);
        zeiger.current = true;
        gezogen.current = [a, b];
        setZiehen(true);
      }}
      onKeyDown={() => {
        zeiger.current = false;
      }}
      onLostPointerCapture={() => {
        setZiehen(false);
        if (!zeiger.current) return;
        zeiger.current = false;
        waehle(...gezogen.current);
      }}
      onValueChange={([neuA = a, neuB = b]) => {
        gezogen.current = [neuA, neuB];
        setStand({ fenster, griffe: [neuA, neuB] });
        // Zurueck am Ausgang meldet Radix kein Loslassen — die Vorschau muss hier gehen.
        onVorschau(neuA === ausgangA && neuB === ausgangB ? null : { von: neuA, bis: neuB });
      }}
      onValueCommit={([neuA = a, neuB = b]) => {
        if (zeiger.current) return;
        clearTimeout(tastenPause.current);
        tastenPause.current = setTimeout(() => {
          waehle(neuA, neuB);
        }, TASTEN_PAUSE_MS);
      }}
    >
      <SliderThumb aria-label={de.verlauf.reglerBeginn} aria-valuetext={datumKurz(tagA)} aria-describedby={gesperrt ? grundId : undefined} />
      <SliderThumb aria-label={de.verlauf.reglerEnde} aria-valuetext={datumKurz(tagB)} aria-describedby={gesperrt ? grundId : undefined} />
    </Slider>
  );

  return (
    <div className="pt-3">
      {gesperrt ? (
        <>
          <MitDemoGrund>{regler}</MitDemoGrund>
          <p id={grundId} className="sr-only">
            {de.verlauf.reglerDemo}
          </p>
        </>
      ) : (
        regler
      )}
    </div>
  );
}

/** Oeffnet den Grund beim Ueberfahren mit der Maus und beim Tippen; ein Klick daneben schliesst ihn. */
function MitDemoGrund({ children }: { readonly children: ReactNode }) {
  const [offen, setOffen] = useState(false);
  const anker = useRef<HTMLDivElement>(null);
  return (
    <Popover open={offen} onOpenChange={setOffen}>
      <PopoverAnchor asChild>
        {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions -- nur Zeiger: gesperrte Griffe nehmen keinen Fokus, Screenreader erreicht der Grund ueber aria-describedby. */}
        <div
          ref={anker}
          className="cursor-not-allowed"
          onPointerEnter={(e) => {
            if (e.pointerType === 'mouse') setOffen(true);
          }}
          onPointerLeave={(e) => {
            if (e.pointerType === 'mouse') setOffen(false);
          }}
          onClick={() => {
            setOffen(true);
          }}
        >
          {children}
        </div>
      </PopoverAnchor>
      <PopoverContent
        aria-label={de.verlauf.reglerBezeichnung}
        onOpenAutoFocus={(e) => {
          e.preventDefault();
        }}
        // Ein Druck auf den Regler selbst gilt Radix als „daneben“ und schloesse, was er oeffnen soll.
        onInteractOutside={(e) => {
          if (e.target instanceof Node && anker.current?.contains(e.target)) e.preventDefault();
        }}
      >
        <p>{de.verlauf.reglerDemo}</p>
      </PopoverContent>
    </Popover>
  );
}
