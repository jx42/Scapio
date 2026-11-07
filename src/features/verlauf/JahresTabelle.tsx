/*
 * Kachel 1, Tabellenansicht: eine Zeile je Kalenderjahr, aeltestes oben. Reine Ansicht —
 * gerechnet ist alles in `core/jahre.ts`. [P-06]
 */

import { de } from '@/i18n/de';
import type { Jahre, Jahreszeile } from '@/lib/api';
import { richtungTon } from '@/lib/farben';
import { datumAlsTagMonat, euroAusCent, monatLang, prozent, richtungswert } from '@/lib/format';
import { cn } from '@/lib/utils';
import { InfoKnopf } from '@/components/InfoKnopf';
import { RichtungsPfeil } from '@/components/RichtungsPfeil';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

const t = de.verlauf.jahre;
const ZAHL = 'text-right whitespace-nowrap tabular-nums';

/**
 * Ein Wert mit Erklaerung im Popover — fuer "nicht berechenbar" und eine verkuerzte Inflation.
 * Kein `title`: der ist ohne Maus nicht erreichbar.
 */
function MitGrund({ grund, children }: { readonly grund: Grund; readonly children: string }) {
  return (
    <>
      {children}
      <InfoKnopf bezeichnung={grund.bezeichnung}>
        <p>{grund.text}</p>
      </InfoKnopf>
    </>
  );
}

/** Die Erklaerung und wofuer sie gilt: Spalte und Jahr, fuer das aria-label. */
type Grund = { readonly text: string; readonly bezeichnung: string };

function grund(spalte: string, zeile: Jahreszeile, text: string): Grund {
  return { text, bezeichnung: t.grundZu(spalte, zeile.jahr) };
}

function Gerichtet({
  wert,
  formatieren,
  grund,
}: {
  readonly wert: number | null;
  readonly formatieren: (b: number) => string;
  /** Warum `wert` fehlt; ohne Angabe kann er nicht fehlen. */
  readonly grund?: Grund;
}) {
  const r = richtungswert(wert, formatieren);
  return (
    <TableCell className={cn(ZAHL, richtungTon[r.richtung])}>
      <RichtungsPfeil pfeil={r.pfeil} className="mr-0.5" />
      {wert === null && grund !== undefined ? <MitGrund grund={grund}>{r.wert}</MitGrund> : r.wert}
    </TableCell>
  );
}

/** Angebrochenes Jahr: Tag und Monat genuegen, das Jahr steht davor. */
function spanne(zeile: Jahreszeile): string | null {
  const ab = zeile.ab === null ? null : datumAlsTagMonat(zeile.ab);
  const bis = zeile.bis === null ? null : datumAlsTagMonat(zeile.bis);
  if (ab !== null && bis !== null) return t.abBis(ab, bis);
  if (ab !== null) return t.ab(ab);
  if (bis !== null) return t.bis(bis);
  return null;
}

function Jahr({ zeile }: { readonly zeile: Jahreszeile }) {
  const zusatz = spanne(zeile);
  return (
    <TableHead scope="row" className="text-sm font-medium whitespace-nowrap text-text">
      {zeile.jahr}
      {zusatz === null ? null : <span className="font-normal text-text-leise"> {zusatz}</span>}
    </TableHead>
  );
}

/**
 * Endet die Inflation vor dem letzten Monat der Zeile, sagt die Erklaerung, bis wann — auch bei
 * einem abgeschlossenen Jahr, solange Eurostat den Dezember noch nicht veroeffentlicht hat.
 */
function Teuerung({ zeile, teuerung }: { readonly zeile: Jahreszeile; readonly teuerung: number }) {
  const bisMonat = zeile.teuerungBisMonat;
  const letzterMonat = zeile.bis === null ? `${zeile.jahr}-12` : zeile.bis.slice(0, 7);
  if (bisMonat === null || bisMonat >= letzterMonat) return prozent(teuerung);
  return <MitGrund grund={grund(t.spalteInflation, zeile, t.inflationBis(monatLang(bisMonat)))}>{prozent(teuerung)}</MitGrund>;
}

export function JahresTabelle({ daten }: { readonly daten: Jahre }) {
  const mitVergleich = daten.benchmark !== null;

  return (
    <Table bereich={t.tabelle}>
      <TableHeader>
        <TableRow>
          <TableHead scope="col">{t.spalteJahr}</TableHead>
          <TableHead scope="col" className="text-right">
            {t.spalteRendite}
          </TableHead>
          {mitVergleich ? (
            <TableHead scope="col" className="text-right">
              {t.spalteVergleich(daten.benchmark!.name)}
            </TableHead>
          ) : null}
          <TableHead scope="col" className="text-right">
            {t.spalteIzf}
          </TableHead>
          <TableHead scope="col" className="text-right">
            {t.spalteInflation}
          </TableHead>
          <TableHead scope="col" className="text-right">
            {t.spalteReal}
          </TableHead>
          <TableHead scope="col" className="text-right">
            {t.spalteGewinn}
          </TableHead>
          <TableHead scope="col" className="text-right">
            {t.spalteEinzahlung}
          </TableHead>
          <TableHead scope="col" className="text-right">
            {t.spalteEndwert}
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {daten.jahre.map((z) => (
          <TableRow key={z.jahr}>
            <Jahr zeile={z} />
            <Gerichtet wert={z.twr} formatieren={prozent} grund={grund(t.spalteRendite, z, t.ohneRendite)} />
            {mitVergleich ? (
              <Gerichtet
                wert={z.vergleich}
                formatieren={prozent}
                grund={grund(t.spalteVergleich(daten.benchmark!.name), z, t.ohneVergleich(daten.benchmark!.name))}
              />
            ) : null}
            <Gerichtet wert={z.izf} formatieren={prozent} grund={grund(t.spalteIzf, z, t.ohneIzf)} />
            <TableCell className={ZAHL}>
              {z.teuerung === null ? (
                <MitGrund grund={grund(t.spalteInflation, z, t.ohneInflation)}>{de.xirr.nichtBerechenbar}</MitGrund>
              ) : (
                <Teuerung zeile={z} teuerung={z.teuerung} />
              )}
            </TableCell>
            <Gerichtet
              wert={z.real}
              formatieren={prozent}
              grund={grund(t.spalteReal, z, z.izf === null ? t.realOhneIzf : t.realOhneInflation)}
            />
            <Gerichtet wert={z.gewinnCent} formatieren={euroAusCent} />
            <TableCell className={ZAHL}>{euroAusCent(z.einzahlungCent, true)}</TableCell>
            <TableCell className={ZAHL}>{euroAusCent(z.endwertCent)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
