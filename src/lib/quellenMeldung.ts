/*
 * Gescheiterte Quellen eines Laufs als Meldungen: je Quellenart eine, mit Ursache (Code),
 * Folge und Abhilfe. Die Kurse aller ISINs und die Fondsverzeichnisse aller Anbieter stehen
 * jeweils in einer Meldung — ein Kurzschluss (ADR-031) laesst sonst ein Dutzend gleicher
 * Alerts entstehen. Wie in `hinweisText.ts` sind die Werte ungeprueft.
 */

import { de } from '@/i18n/de';
import type { LaufHinweis } from '@/lib/api';
import { istNetzFehlerCode, type LaufFehlerCode } from '../../shared/laufFehler.ts';

export type QuellenMeldung = {
  readonly schluessel: string;
  readonly titel: string;
  /** `null` bei einem Lauf aus der Zeit, bevor der Code je Quelle gespeichert wurde. */
  readonly grund: string | null;
  readonly folge: string;
  readonly tun: string;
  readonly code: string | null;
  readonly erneutSinnvoll: boolean;
};

const q = de.laufhinweise.quelle;
const c = de.laufhinweise.quelleCode;

/** Hier hilft kein zweiter Versuch, nur eine neue Version. */
const SCHNITTSTELLE: ReadonlySet<string> = new Set(['E_MCP_RPC', 'E_SCHEMA', 'E_MCP_ARGUMENT', 'E_MCP_SEITEN'] satisfies LaufFehlerCode[]);

const ANBIETER: Readonly<Record<string, string>> = { ishares: 'iShares', xtrackers: 'Xtrackers', amundi: 'Amundi' };

function codeText(code: string): { readonly grund: string; readonly tun: string } {
  if (code in c) return c[code as keyof typeof c];
  if (SCHNITTSTELLE.has(code)) return c.schnittstelle;
  if (istNetzFehlerCode(code)) return c.netz;
  return c.sonst;
}

function quellenText(art: string, teile: readonly string[]): { readonly titel: string; readonly folge: string; readonly tun?: string } {
  switch (art) {
    case 'kurse':
      return { titel: q.kurse.titel, folge: q.kurse.folge(teile.length) };
    case 'fondskatalog':
      return { titel: q.fondskatalog.titel, folge: q.fondskatalog.folge(teile.map((t) => ANBIETER[t] ?? t).join(', ')) };
    case 'holdings':
    case 'cash':
    case 'sparplaene':
    case 'gesamtwert':
    case 'vpi':
    case 'vpi-aktuell':
    case 'zins':
    case 'art':
    case 'fonds':
    case 'fondsaufloesung':
      return q[art];
    default:
      return { titel: q.sonst.titel, folge: q.sonst.folge(teile.join(', ')) };
  }
}

/** Die Anmeldung hat ihren eigenen Alert (`McpAnmeldungHinweise`) und fehlt hier deshalb. */
export function quellenMeldungen(
  hinweise: readonly LaufHinweis[],
  quellen: Readonly<Record<string, string>>,
): QuellenMeldung[] {
  const gruppen = new Map<string, { code: string | null; teile: string[] }>();
  for (const h of hinweise) {
    if (h.art !== 'quelleGescheitert') continue;
    const w = h.werte as Readonly<Record<string, unknown>>;
    const quelle = typeof w.quelle === 'string' ? w.quelle : '—';
    const code = typeof w.code === 'string' ? w.code : 'E_UNBEKANNT';
    if (code === 'E_MCP_ANMELDUNG') continue;
    const trenner = quelle.indexOf(':');
    const art = trenner < 0 ? quelle : quelle.slice(0, trenner);
    // Ohne Transaktionen endet der Lauf als `fehler`; dessen Alert nennt den Code schon.
    if (art === 'transaktionen') continue;
    const teil = quelle.slice(trenner + 1);
    const gruppe = gruppen.get(art) ?? { code, teile: [] };
    gruppe.teile.push(teil);
    gruppen.set(art, gruppe);
  }
  // Laeufe vor `quelleGescheitert` kennen nur den Status — Bestand und Kontostand bleiben trotzdem sichtbar.
  for (const art of ['holdings', 'cash']) {
    if (quellen[art] === 'fehler' && !gruppen.has(art)) gruppen.set(art, { code: null, teile: [art] });
  }

  return [...gruppen].map(([art, { code, teile }]) => {
    const quelle = quellenText(art, teile);
    const ursache = code === null ? null : codeText(code);
    return {
      schluessel: art,
      titel: quelle.titel,
      grund: ursache?.grund ?? null,
      folge: quelle.folge,
      tun: quelle.tun ?? ursache?.tun ?? de.laufhinweise.erneutVersuchen,
      code,
      erneutSinnvoll: art !== 'fonds' && (code === null || !SCHNITTSTELLE.has(code)),
    };
  });
}
