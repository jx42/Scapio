/*
 * Kachel 2, Detail: der Rebalancing-Rechner. Ansicht — die Abfrage haelt `AufteilungKachel`,
 * hier stehen nur Eingabe und Ergebnis. Rechnung, keine Empfehlung: das Ziel setzt der
 * Nutzer, ausgegeben wird ein Betrag, nie eine Stueckzahl oder ein Auftrag. [ADR-057]
 *
 * Der Inhalt mountet erst mit dem geoeffneten Dialog, damit jedes Oeffnen frisch aus dem
 * Speicher vorbelegt — Radix haengt `DialogContent` im geschlossenen Zustand aus.
 */

import { useEffect, useId, useState } from 'react';
import { Scale } from 'lucide-react';

import { de } from '@/i18n/de';
import type { PositionZeile, Rebalancing, RebalancingZeile } from '@/lib/api';
import { euroAusCent, prozent, vorzeichen, zielEingabe } from '@/lib/format';
import { richtungTon } from '@/lib/farben';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  BP_GANZ,
  KONTO,
  bpAusEingabe,
  zielAusParameter,
  zielLesen,
  zielParameter,
  zielSchreiben,
} from '@/features/aufteilung/zielaufteilung';

export type RebalancingErgebnisZustand = {
  readonly daten: Rebalancing | undefined;
  readonly fehler: Error | null;
  readonly laedt: boolean;
};

export type RebalancingDialogProps = {
  readonly positionen: readonly PositionZeile[];
  readonly cashCent: number;
  readonly cashAnteil: number;
  readonly gesamtCent: number | null;
  /** Das zuletzt berechnete Ziel als Query-Wert, `null` vor dem ersten Berechnen. */
  readonly angefragt: string | null;
  readonly ergebnis: RebalancingErgebnisZustand;
  readonly onBerechnen: (ziel: string) => void;
  /** Das feste Beispielziel im Demo-Abzug; die Felder sind dann gesperrt. */
  readonly festesZiel?: string | null;
  /** Nur fuer die Randfallseite: der Dialog steht offen. */
  readonly anfangsOffen?: boolean;
};

export function RebalancingDialog({ anfangsOffen = false, ...props }: RebalancingDialogProps) {
  const [offen, setOffen] = useState(anfangsOffen);
  return (
    <>
      <Button type="button" variant="outline" size="sm" onClick={() => setOffen(true)} className="gap-1.5">
        <Scale aria-hidden="true" className="size-3.5" />
        {de.rebalancing.knopf}
      </Button>
      <Dialog open={offen} onOpenChange={setOffen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>{de.rebalancing.titel}</DialogTitle>
            <DialogDescription className="sr-only">{de.rebalancing.beschreibung}</DialogDescription>
          </DialogHeader>
          <RebalancingInhalt {...props} />
        </DialogContent>
      </Dialog>
    </>
  );
}

type Zeile = {
  readonly schluessel: string;
  readonly name: string;
  readonly istCent: number;
  readonly istAnteil: number;
};

type Anfang = { eingaben: Record<string, string>; ausgeschlossen: ReadonlySet<string> };

function anfang(zeilen: readonly Zeile[], festesZiel: string | null): Anfang {
  const vorhanden = new Set(zeilen.map((z) => z.schluessel));
  const eingaben: Record<string, string> = {};
  if (festesZiel !== null) {
    const ziel = zielAusParameter(festesZiel);
    for (const [schluessel, bp] of ziel) if (vorhanden.has(schluessel)) eingaben[schluessel] = zielEingabe(bp);
    return { eingaben, ausgeschlossen: new Set([...vorhanden].filter((s) => !ziel.has(s))) };
  }
  // Eine verkaufte Position faellt heraus; eine neue beginnt leer, also mit 0 %.
  const gespeichert = zielLesen();
  for (const [schluessel, bp] of gespeichert.ziel) if (vorhanden.has(schluessel)) eingaben[schluessel] = zielEingabe(bp);
  return { eingaben, ausgeschlossen: new Set(gespeichert.ausgeschlossen.filter((s) => vorhanden.has(s))) };
}

function RebalancingInhalt({
  positionen,
  cashCent,
  cashAnteil,
  gesamtCent,
  angefragt,
  ergebnis,
  onBerechnen,
  festesZiel = null,
}: Omit<RebalancingDialogProps, 'anfangsOffen'>) {
  const id = useId();
  const gesperrt = festesZiel !== null;
  const zeilen: Zeile[] = [
    { schluessel: KONTO, name: de.rebalancing.konto, istCent: cashCent, istAnteil: cashAnteil },
    ...positionen.map((p) => ({ schluessel: p.isin, name: p.name, istCent: p.wertCent, istAnteil: p.anteil })),
  ];
  const [start] = useState(() => anfang(zeilen, festesZiel));
  const [eingaben, setEingaben] = useState(start.eingaben);
  const [ausgeschlossen, setAusgeschlossen] = useState(start.ausgeschlossen);

  const einbezogen = zeilen.filter((z) => !ausgeschlossen.has(z.schluessel));
  const bp = new Map(einbezogen.map((z) => [z.schluessel, bpAusEingabe(eingaben[z.schluessel] ?? '')]));
  const feldFehler = [...bp.values()].some((b) => b === null);
  const summe = [...bp.values()].reduce<number>((s, b) => s + (b ?? 0), 0);
  const ziel = festesZiel ?? zielParameter(einbezogen.map((z) => [z.schluessel, bp.get(z.schluessel) ?? 0] as const));
  const bereit = einbezogen.length > 0 && !feldFehler && summe === BP_GANZ;
  const veraltet = angefragt !== null && angefragt !== ziel;
  // Nur ein geaendertes Ziel gibt etwas zu berechnen; die Ist-Werte aendert erst ein Lauf.
  const berechenbar = bereit && angefragt !== ziel;

  const daten = angefragt === null ? undefined : ergebnis.daten;
  const abbruch = daten?.drift.stufe === 'abbruch';
  const zeigeErgebnis = daten !== undefined && daten.art === 'ok' && !abbruch;
  const ergebnisJe = new Map<string, RebalancingZeile>(zeigeErgebnis ? daten.zeilen.map((z) => [z.schluessel, z]) : []);

  const feldFehlerId = `${id}-feldfehler`;
  const summeId = `${id}-summe`;

  const setze = (schluessel: string, text: string) => setEingaben((alt) => ({ ...alt, [schluessel]: text }));
  const einbeziehen = (schluessel: string, ja: boolean) =>
    setAusgeschlossen((alt) => {
      const neu = new Set(alt);
      if (ja) neu.delete(schluessel);
      else neu.add(schluessel);
      return neu;
    });

  const berechnen = () => {
    if (!berechenbar) return;
    if (!gesperrt) {
      // Auch das Ziel einer ausgeschlossenen Zeile bleibt gemerkt, fuer das naechste Einbeziehen.
      const gemerkt = new Map<string, number>();
      for (const z of zeilen) {
        const b = bpAusEingabe(eingaben[z.schluessel] ?? '');
        if (b !== null) gemerkt.set(z.schluessel, b);
      }
      zielSchreiben({ ziel: gemerkt, ausgeschlossen: [...ausgeschlossen] });
    }
    onBerechnen(ziel);
  };

  // Beim Oeffnen gleich mit dem gemerkten Ziel rechnen; die Ist-Werte holt der Server frisch.
  useEffect(() => {
    if (bereit) onBerechnen(ziel);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- nur beim Oeffnen
  }, []);

  const summenHinweis = feldFehler
    ? null
    : einbezogen.length === 0
      ? de.rebalancing.nichtsEinbezogen
      : summe < BP_GANZ
        ? de.rebalancing.summeFehlt(prozent((BP_GANZ - summe) / BP_GANZ))
        : summe > BP_GANZ
          ? de.rebalancing.summeZuViel(prozent((summe - BP_GANZ) / BP_GANZ))
          : null;

  const statusText = angefragt !== null && !veraltet && ergebnis.laedt ? de.rebalancing.laedt : '';

  return (
    <div className="grid gap-4">
      {gesperrt ? <p className="text-text-leise">{de.rebalancing.gesperrt}</p> : null}

      <Table bereich={de.rebalancing.tabelle}>
        <TableHeader>
          <TableRow>
            <TableHead scope="col">{de.rebalancing.spaltePosition}</TableHead>
            <TableHead scope="col" className="text-right max-sm:hidden">
              {de.rebalancing.spalteIstWert}
            </TableHead>
            <TableHead scope="col" className="text-right max-sm:hidden">
              {de.rebalancing.spalteIstAnteil}
            </TableHead>
            <TableHead scope="col" className="text-right">
              {de.rebalancing.spalteZiel}
            </TableHead>
            <TableHead scope="col" className="text-right max-sm:hidden">
              {de.rebalancing.spalteAbweichung}
            </TableHead>
            <TableHead scope="col" className="text-right">
              {de.rebalancing.spalteBetrag}
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {zeilen.map((z) => {
            const feldId = `${id}-ziel-${z.schluessel}`;
            const aus = ausgeschlossen.has(z.schluessel);
            const ungueltig = !aus && bp.get(z.schluessel) === null;
            const e = ergebnisJe.get(z.schluessel);
            return (
              <TableRow key={z.schluessel}>
                <TableHead scope="row" className="h-auto py-1.5 text-sm font-normal whitespace-normal text-text">
                  <label className={cn('flex min-h-6 cursor-pointer items-center gap-2', aus && 'text-text-leise')}>
                    <input
                      type="checkbox"
                      className="size-4 shrink-0 accent-chart-1"
                      checked={!aus}
                      onChange={(ev) => einbeziehen(z.schluessel, ev.target.checked)}
                      disabled={gesperrt}
                      aria-label={de.rebalancing.einbeziehen(z.name)}
                    />
                    {z.name}
                  </label>
                  <span className="block text-xs text-text-leise sm:hidden">
                    {de.rebalancing.istKurz(euroAusCent(z.istCent), prozent(z.istAnteil))}
                  </span>
                </TableHead>
                <TableCell className={cn('text-right tabular-nums max-sm:hidden', aus && 'text-text-leise')}>
                  {euroAusCent(z.istCent)}
                </TableCell>
                <TableCell className={cn('text-right tabular-nums max-sm:hidden', aus && 'text-text-leise')}>
                  {prozent(z.istAnteil)}
                </TableCell>
                <TableCell className="text-right">
                  <label htmlFor={feldId} className="sr-only">
                    {de.rebalancing.zielFeld(z.name)}
                  </label>
                  <input
                    id={feldId}
                    type="text"
                    inputMode="decimal"
                    autoComplete="off"
                    placeholder={zielEingabe(0)}
                    value={eingaben[z.schluessel] ?? ''}
                    onChange={(ev) => setze(z.schluessel, ev.target.value)}
                    disabled={gesperrt || aus}
                    aria-invalid={ungueltig ? true : undefined}
                    aria-describedby={ungueltig ? feldFehlerId : undefined}
                    className={cn(
                      'h-8 w-20 rounded-md border border-input bg-bedien px-2 text-right tabular-nums text-text disabled:opacity-60',
                      ungueltig && 'border-verlust',
                    )}
                  />
                </TableCell>
                <TableCell className={cn('text-right tabular-nums whitespace-nowrap max-sm:hidden', veraltet && 'opacity-50')}>
                  {aus || e === undefined ? '' : prozent(e.abweichung, true)}
                </TableCell>
                <TableCell className={cn('text-right tabular-nums whitespace-nowrap', veraltet && 'opacity-50')}>
                  {aus || e === undefined ? '' : <Betrag zeile={e} />}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
        <TableFooter>
          <TableRow>
            <TableHead scope="row" className="text-sm text-text">
              {de.rebalancing.summe}
            </TableHead>
            <TableCell className="text-right tabular-nums max-sm:hidden">
              {gesamtCent === null ? '' : euroAusCent(gesamtCent)}
            </TableCell>
            <TableCell className="max-sm:hidden" />
            <TableCell className={cn('text-right tabular-nums', !bereit && 'text-warnung')}>
              {prozent(summe / BP_GANZ)}
            </TableCell>
            <TableCell className="max-sm:hidden" />
            <TableCell />
          </TableRow>
        </TableFooter>
      </Table>

      {feldFehler ? (
        <p id={feldFehlerId} className="text-verlust">
          {de.rebalancing.feldUngueltig}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center justify-end gap-3">
        <p id={summeId} className="mr-auto text-warnung">
          {summenHinweis}
        </p>
        <Button type="button" onClick={berechnen} disabled={!berechenbar} aria-describedby={summenHinweis === null ? undefined : summeId}>
          {de.rebalancing.berechnen}
        </Button>
      </div>

      {/* Leer nur aus dem Fluss nehmen, nicht aushaengen: die Live-Region muss vor ihrem Text stehen. */}
      <p role="status" className="text-text-leise empty:sr-only">
        {statusText}
      </p>
      {ergebnis.fehler !== null && angefragt !== null && !veraltet ? (
        <p role="alert" className="text-verlust">
          {ergebnis.fehler.message}
        </p>
      ) : null}
      {daten === undefined || veraltet ? null : <Ergebnishinweise daten={daten} />}
    </div>
  );
}

function Betrag({ zeile }: { zeile: RebalancingZeile }) {
  const { richtung } = vorzeichen(zeile.deltaCent);
  if (richtung === 'neutral') return <span className={richtungTon.neutral}>{euroAusCent(0)}</span>;
  const r = de.rebalancing.richtung;
  const wort =
    zeile.schluessel === KONTO ? (richtung === 'auf' ? r.aufsKonto : r.vomKonto) : richtung === 'auf' ? r.kaufen : r.verkaufen;
  return <span className={richtungTon[richtung]}>{de.rebalancing.betrag(euroAusCent(zeile.deltaCent, true), wort)}</span>;
}

function Ergebnishinweise({ daten }: { daten: Rebalancing }) {
  if (daten.drift.stufe === 'abbruch') {
    return (
      <p role="alert" className="text-verlust">
        {de.rebalancing.driftAbbruch}
      </p>
    );
  }
  return (
    <>
      {daten.drift.stufe === 'banner' ? <p className="text-warnung">{de.rebalancing.driftBanner}</p> : null}
      {daten.art === 'ohneWert' ? <p>{de.rebalancing.ohneWert}</p> : null}
    </>
  );
}
