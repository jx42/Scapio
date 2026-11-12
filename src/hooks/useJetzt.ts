/*
 * Die Uhrzeit fuer relative Angaben wie "Vor 5 Minuten aktualisiert", im Takt nachgezogen.
 * Bei verborgenem Tab laeuft kein Timer; beim Zurueckkehren (Laptop aufgeklappt, Tab
 * gewechselt) wird sofort nachgezogen, statt bis zum naechsten Takt eine alte Angabe zu zeigen.
 * Nur die Komponente, die den Hook benutzt, rendert neu.
 */
import { useEffect, useState } from 'react';

export function useJetzt(taktMs = 60_000): Date {
  const [jetzt, setJetzt] = useState(() => new Date());

  useEffect(() => {
    let takt: ReturnType<typeof setInterval> | undefined;
    const weiter = (): void => {
      takt = setInterval(() => {
        setJetzt(new Date());
      }, taktMs);
    };
    const sichtbarkeit = (): void => {
      clearInterval(takt);
      if (document.visibilityState !== 'visible') return;
      setJetzt(new Date());
      weiter();
    };

    if (document.visibilityState === 'visible') weiter();
    document.addEventListener('visibilitychange', sichtbarkeit);
    return () => {
      clearInterval(takt);
      document.removeEventListener('visibilitychange', sichtbarkeit);
    };
  }, [taktMs]);

  return jetzt;
}
