/*
 * Kachel 2, Detail: der Rebalancing-Rechner. Ansicht — die Abfrage haelt `AufteilungKachel`,
 * hier stehen nur Eingabe und Ergebnis. Rechnung, keine Empfehlung: das Ziel setzt der
 * Nutzer, ausgegeben wird ein Betrag, nie eine Stueckzahl oder ein Auftrag. [ADR-057]
 *
 * Der Inhalt mountet erst mit dem geoeffneten Dialog, damit jedes Oeffnen frisch aus dem
 * Speicher vorbelegt — Radix haengt `DialogContent` im geschlossenen Zustand aus.
 */

import { useId, useState, type FormEvent } from 'react';
import { Scale, X } from 'lucide-react';

import { de } from '@/i18n/de';
import type { PositionZeile, Rebalancing, RebalancingZeile } from '@/lib/api';
import { euroAusCent, prozent, vorzeichen, zeitpunktNurTag, zielEingabe } from '@/lib/format';
import { richtungTon } from '@/lib/farben';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { InfoKnopf } from '@/components/InfoKnopf';
import {
  BP_GANZ,
  HOECHSTENS_ZEILEN,
  KONTO,
  bpAusEingabe,
  gleichGewichtet,
  istIsin,
  zielAusParameter,
  zielLesen,
  zielParameter,
  zielSchreiben,
} from '@/features/aufteilung/zielaufteilung';

export type RebalancingAnfrage = { readonly ziel: string; readonly ohneVerkaeufe: boolean };

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
  readonly stand: string | null;
  readonly angefragt: RebalancingAnfrage | null;
  readonly ergebnis: RebalancingErgebnisZustand;
  readonly onBerechnen: (anfrage: RebalancingAnfrage) => void;
  /** Das feste Beispielziel im Demo-Abzug; die Felder sind dann gesperrt. */
  readonly festesZiel?: string | null;
  /** Nur fuer die Randfallseite: der Dialog steht offen. */
  readonly anfangsOffen?: boolean;
};

export function RebalancingDialog({ anfangsOffen = false, ...props }: RebalancingDialogProps) {
  const [offen, setOffen] = useState(anfangsOffen);
  return (
    <>
      <Button type="button" variant="link" onClick={() => setOffen(true)} className="h-auto min-h-6 gap-1 p-0 font-normal">
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
  readonly imDepot: boolean;
};

type Anfang = { eingaben: Record<string, string>; weitere: string[]; ohneVerkaeufe: boolean };

function anfang(positionen: readonly PositionZeile[], festesZiel: string | null): Anfang {
  const gespeichert = festesZiel === null ? zielLesen() : { ziel: zielAusParameter(festesZiel), weitere: [], ohneVerkaeufe: false };
  const imDepot = new Set(positionen.map((p) => p.isin));
  const weitere = gespeichert.weitere.filter((isin) => !imDepot.has(isin));
  // Eine verkaufte Position faellt heraus; eine neue beginnt leer, also mit 0 %.
  const zeilen = new Set([KONTO, ...imDepot, ...weitere]);
  const eingaben: Record<string, string> = {};
  for (const [schluessel, bp] of gespeichert.ziel) {
    if (zeilen.has(schluessel)) eingaben[schluessel] = zielEingabe(bp);
  }
  return { eingaben, weitere, ohneVerkaeufe: gespeichert.ohneVerkaeufe };
}

function RebalancingInhalt({
  positionen,
  cashCent,
  cashAnteil,
  gesamtCent,
  stand,
  angefragt,
  ergebnis,
  onBerechnen,
  festesZiel = null,
}: Omit<RebalancingDialogProps, 'anfangsOffen'>) {
  const id = useId();
  const gesperrt = festesZiel !== null;
  const [start] = useState(() => anfang(positionen, festesZiel));
  const [eingaben, setEingaben] = useState(start.eingaben);
  const [weitere, setWeitere] = useState(start.weitere);
  const [ohneVerkaeufe, setOhneVerkaeufe] = useState(start.ohneVerkaeufe);
  const [neueIsin, setNeueIsin] = useState('');
  const [isinFehler, setIsinFehler] = useState<string | null>(null);

  const zeilen: Zeile[] = [
    { schluessel: KONTO, name: de.rebalancing.konto, istCent: cashCent, istAnteil: cashAnteil, imDepot: true },
    ...positionen.map((p) => ({ schluessel: p.isin, name: p.name, istCent: p.wertCent, istAnteil: p.anteil, imDepot: true })),
    ...weitere.map((isin) => ({ schluessel: isin, name: isin, istCent: 0, istAnteil: 0, imDepot: false })),
  ];
  const bp = zeilen.map((z) => bpAusEingabe(eingaben[z.schluessel] ?? ''));
  const feldFehler = bp.some((b) => b === null);
  const summe = bp.reduce<number>((s, b) => s + (b ?? 0), 0);
  const ziel = festesZiel ?? zielParameter(zeilen.map((z, i) => [z.schluessel, bp[i] ?? 0] as const));
  const bereit = !feldFehler && summe === BP_GANZ;
  const veraltet = angefragt !== null && (angefragt.ziel !== ziel || angefragt.ohneVerkaeufe !== ohneVerkaeufe);

  const daten = angefragt === null ? undefined : ergebnis.daten;
  const abbruch = daten?.drift.stufe === 'abbruch';
  const zeigeErgebnis = daten !== undefined && daten.art === 'ok' && !abbruch;
  const ergebnisJe = new Map<string, RebalancingZeile>(zeigeErgebnis ? daten.zeilen.map((z) => [z.schluessel, z]) : []);

  const feldFehlerId = `${id}-feldfehler`;
  const summeId = `${id}-summe`;
  const isinId = `${id}-isin`;
  const isinFehlerId = `${id}-isinfehler`;

  const setze = (schluessel: string, text: string) => setEingaben((alt) => ({ ...alt, [schluessel]: text }));

  const gleichVerteilen = () => {
    const positionsZeilen = zeilen.filter((z) => z.schluessel !== KONTO);
    const anteile = gleichGewichtet(positionsZeilen.length);
    const neu: Record<string, string> = { [KONTO]: zielEingabe(0) };
    positionsZeilen.forEach((z, i) => {
      neu[z.schluessel] = zielEingabe(anteile[i] ?? 0);
    });
    setEingaben(neu);
  };

  const aufnehmen = (e: FormEvent) => {
    e.preventDefault();
    const isin = neueIsin.trim().toUpperCase();
    if (!istIsin(isin)) return setIsinFehler(de.rebalancing.isinUngueltig);
    if (zeilen.some((z) => z.schluessel === isin)) return setIsinFehler(de.rebalancing.isinVorhanden);
    if (zeilen.length >= HOECHSTENS_ZEILEN) return setIsinFehler(de.rebalancing.zuVieleZeilen);
    setWeitere((alt) => [...alt, isin]);
    setNeueIsin('');
    setIsinFehler(null);
  };

  const entfernen = (isin: string) => {
    setWeitere((alt) => alt.filter((s) => s !== isin));
    setEingaben(({ [isin]: _, ...rest }) => rest);
  };

  const berechnen = () => {
    if (!bereit) return;
    if (!gesperrt) {
      zielSchreiben({ ziel: new Map(zeilen.map((z, i) => [z.schluessel, bp[i] ?? 0])), weitere, ohneVerkaeufe });
    }
    onBerechnen({ ziel, ohneVerkaeufe });
  };

  const summenHinweis = feldFehler
    ? null
    : summe < BP_GANZ
      ? de.rebalancing.summeFehlt(prozent((BP_GANZ - summe) / BP_GANZ))
      : summe > BP_GANZ
        ? de.rebalancing.summeZuViel(prozent((summe - BP_GANZ) / BP_GANZ))
        : null;

  const statusText =
    angefragt === null ? '' : veraltet ? de.rebalancing.veraltet : ergebnis.laedt ? de.rebalancing.laedt : de.rebalancing.fertig;
  const standText = zeitpunktNurTag(daten?.stand ?? stand);

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button type="button" variant="outline" size="sm" onClick={gleichVerteilen} disabled={gesperrt}>
          {de.rebalancing.gleichGewichten}
        </Button>
        <label className="flex min-h-6 cursor-pointer items-center gap-2">
          <input
            type="checkbox"
            className="size-4 accent-chart-1"
            checked={ohneVerkaeufe}
            onChange={(e) => setOhneVerkaeufe(e.target.checked)}
          />
          {de.rebalancing.ohneVerkaeufe}
        </label>
      </div>
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
            <TableHead scope="col" className="text-right">
              {de.rebalancing.spalteBetrag}
            </TableHead>
            <TableHead scope="col" className="text-right">
              {de.rebalancing.spalteDanach}
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {zeilen.map((z, i) => {
            const feldId = `${id}-ziel-${z.schluessel}`;
            const ungueltig = bp[i] === null;
            const e = ergebnisJe.get(z.schluessel);
            return (
              <TableRow key={z.schluessel}>
                <TableHead scope="row" className="h-auto py-1.5 text-sm font-normal whitespace-normal text-text">
                  <span className="flex items-center gap-1">
                    {z.name}
                    {z.imDepot ? null : (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-6"
                        aria-label={de.rebalancing.entfernen(z.schluessel)}
                        onClick={() => entfernen(z.schluessel)}
                      >
                        <X aria-hidden="true" />
                      </Button>
                    )}
                  </span>
                  <span className="block text-xs text-text-leise sm:hidden">
                    {de.rebalancing.istKurz(euroAusCent(z.istCent), prozent(z.istAnteil))}
                  </span>
                  {z.imDepot ? null : <span className="block text-xs text-text-leise">{de.rebalancing.nichtImDepot}</span>}
                </TableHead>
                <TableCell className="text-right tabular-nums max-sm:hidden">{euroAusCent(z.istCent)}</TableCell>
                <TableCell className="text-right tabular-nums max-sm:hidden">{prozent(z.istAnteil)}</TableCell>
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
                    disabled={gesperrt}
                    aria-invalid={ungueltig ? true : undefined}
                    aria-describedby={ungueltig ? feldFehlerId : undefined}
                    className={cn(
                      'h-8 w-20 rounded-md border border-input bg-bedien px-2 text-right tabular-nums text-text disabled:opacity-60',
                      ungueltig && 'border-verlust',
                    )}
                  />
                </TableCell>
                <TableCell className={cn('text-right tabular-nums whitespace-nowrap', veraltet && 'opacity-50')}>
                  {e === undefined ? '' : <Betrag zeile={e} />}
                </TableCell>
                <TableCell className={cn('text-right tabular-nums', veraltet && 'opacity-50')}>
                  {e === undefined ? '' : prozent(e.anteilDanach)}
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
            <TableCell />
            <TableCell />
          </TableRow>
        </TableFooter>
      </Table>

      {gesperrt ? null : (
        <form onSubmit={aufnehmen} className="flex flex-wrap items-center gap-2">
          <label htmlFor={isinId}>{de.rebalancing.weitereIsin}</label>
          <input
            id={isinId}
            type="text"
            autoComplete="off"
            spellCheck={false}
            maxLength={12}
            value={neueIsin}
            onChange={(ev) => setNeueIsin(ev.target.value)}
            aria-invalid={isinFehler === null ? undefined : true}
            aria-describedby={isinFehler === null ? undefined : isinFehlerId}
            className="h-8 w-36 rounded-md border border-input bg-bedien px-2 uppercase text-text"
          />
          <Button type="submit" variant="outline" size="sm">
            {de.rebalancing.hinzufuegen}
          </Button>
          {isinFehler === null ? null : (
            <p id={isinFehlerId} className="w-full text-verlust">
              {isinFehler}
            </p>
          )}
        </form>
      )}

      {feldFehler ? (
        <p id={feldFehlerId} className="text-verlust">
          {de.rebalancing.feldUngueltig}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center justify-end gap-3">
        <p id={summeId} className="mr-auto text-warnung">
          {summenHinweis}
        </p>
        <InfoKnopf bezeichnung={de.rebalancing.titel}>
          <p>{standText === null ? de.rebalancing.infoOhneStand : de.rebalancing.info(standText)}</p>
        </InfoKnopf>
        <Button type="button" onClick={berechnen} disabled={!bereit} aria-describedby={summenHinweis === null ? undefined : summeId}>
          {de.rebalancing.berechnen}
        </Button>
      </div>

      <p role="status" className="text-text-leise">
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
      {daten.art === 'ok' && daten.ohneVerkaeufe && daten.abstandDanachCent > 0 ? (
        <p>{de.rebalancing.abstand(euroAusCent(daten.abstandDanachCent), prozent(daten.abstandDanach))}</p>
      ) : null}
    </>
  );
}
