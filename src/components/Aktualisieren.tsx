/*
 * Die beiden Knöpfe der Anwendung, die etwas verändern.
 *
 * Ablauf: POST /api/refresh, bei 202 wird /api/lauf alle 1,5 s
 * abgefragt, bis der Lauf endet; danach werden alle Queries verworfen. Bei 409 laeuft
 * schon einer — dann wird er angezeigt und kein zweiter gestartet. Einen laufenden Lauf
 * zeigt nur der Knopf: Spinner und der Schritt, den `/api/lauf` meldet.
 * Ein Schritt kommt nur aus dem Lauf, auf den dieser Klick wartet — der Cache haelt anfangs
 * noch den vorigen.
 *
 * Einen eigenen Anmeldeknopf zeigt dieser Container nicht mehr: den stellt die Alert-Reihe
 * in App.tsx (`McpAnmeldungHinweise`), die bei jedem Stand der Anmeldung sichtbar ist —
 * ein zweiter Knopf hier daneben waere derselbe Klick doppelt. Dieser Container haelt die
 * Mutation trotzdem selbst (POST /api/mcp-anmeldung, danach lesend abgefragt, bis die
 * Anmeldung im Browser abgeschlossen oder gescheitert ist, [ADR-012]) und reicht sie ueber
 * `onAnmeldungStatus.onAnmelden` an den Alert weiter. Solange die Anmeldung faellig ist
 * oder laeuft, sperrt er nur den Aktualisieren-Knopf: ein Klick darauf schluege ohnehin
 * wieder mit `E_MCP_ANMELDUNG` fehl.
 *
 * Der Ablauftext dazu (noetig, laeuft, erfolgreich, gescheitert) steht nicht mehr hier:
 * er betrifft die ganze Seite genauso wie die Hinweise des letzten Laufs und wandert
 * deshalb ueber `onAnmeldungStatus` zu `Seite` in App.tsx, die ihn als Alert zwischen
 * Seitentitel und Kacheln zeigt. Dieser Container bleibt der einzige Halter des Zustands
 * (eine Abfrage, eine Mutation) — `Seite` liest ihn nur mit, statt ihn zu verdoppeln.
 *
 * `/api/lauf` wird ANFANGS EINMAL abgefragt, nicht erst nach einem Klick: sonst waere ein
 * gescheiterter Lauf nach dem Neuladen der Seite unsichtbar, und mit ihm der Hinweis,
 * dass eine Anmeldung faellig ist.
 *
 * Das Token holt `lib/api.ts` selbst aus dem <meta>. Es taucht hier nicht auf, wird
 * nicht durchgereicht und nicht angezeigt.
 *
 * Im Demo-Modus sind beide Knoepfe gesperrt: das synthetische Depot hat keine
 * Gegenstelle, von der ein Lauf etwas holen koennte, und der Ingest wird dort gar
 * nicht erst angefasst (`start/demo.ts`). Ein Klick koennte also nur scheitern.
 * Den Grund nennt ein Popover am Knopf statt eines staendig sichtbaren Satzes — der
 * Demo-Modus ist der Normalfall dieser Seite und nicht der Rede wert, solange
 * niemand fragt. Popover, nicht Tooltip: der oeffnet auf Touchgeraeten nie (WCAG 1.4.13).
 */

import { useEffect, useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

import { de } from '@/i18n/de';
import { ApiFehler, api, schluessel, type Lauf, type LaufSchritt } from '@/lib/api';
import { istDemoModus } from '@/lib/demoModus';
import { tokenVorhanden } from '@/lib/token';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

/** 1,5 s — dicht genug, um Fortschritt zu sehen, weit genug, um nichts zu fluten. */
const ABFRAGE_MS = 1500;

/** Der Fehlercode, auf den der Anmeldeknopf reagiert. Er kommt aus `ingest/`. */
const ANMELDUNG_NOETIG = 'E_MCP_ANMELDUNG';

export type AktualisierenAnsichtProps = {
  readonly kannAktualisieren: boolean;
  /** Zeigt die Seite das synthetische Demo-Depot? Dann veraendert hier nichts mehr etwas. */
  readonly demo: boolean;
  readonly laeuft: boolean;
  /** Schritt des laufenden Laufs; `null`, solange der Server keinen meldet. */
  readonly schritt?: LaufSchritt | null;
  /** Faellig nach `E_MCP_ANMELDUNG` oder vor der ersten Anmeldung — sperrt den Knopf. */
  readonly anmeldungNoetig: boolean;
  /** Laeuft gerade ein Anmeldeversuch im Browser? Steuert nur noch den Knopf selbst —
   *  der erklaerende Satz dazu steht als Alert in App.tsx. */
  readonly anmeldungLaeuft: boolean;
  readonly onKlick: () => void;
};

/** Reine Ansicht: keine Query, kein Timer. So laesst sie sich ohne Server pruefen. */
export function AktualisierenAnsicht({
  kannAktualisieren,
  demo,
  laeuft,
  schritt = null,
  anmeldungNoetig,
  anmeldungLaeuft,
  onKlick,
}: AktualisierenAnsichtProps) {
  // Ein fehlendes Token und der Demo-Modus sperren den Knopf aus demselben Grund:
  // es gibt nichts, was ein Klick von hier aus erreichen koennte.
  const gesperrt = !kannAktualisieren || demo;

  /*
   * Im Demo-Modus `aria-disabled` statt `disabled`: ein gesperrter Knopf empfaengt weder
   * Zeigerereignisse noch Fokus, das Popover an ihm oeffnete also nie [P-06].
   * `aria-disabled` meldet Screenreadern denselben Zustand, laesst den Knopf aber
   * erreichbar; ein Druck darauf oeffnet nur den Grund. Gedimmt wird nur der Inhalt —
   * `opacity-50` am Knopf dimmte den Fokusring mit (2.4.11).
   */
  const aktualisieren = (
    <Button
      type="button"
      size="sm"
      onClick={demo ? undefined : onKlick}
      disabled={demo ? undefined : gesperrt || laeuft || anmeldungNoetig || anmeldungLaeuft}
      aria-disabled={demo || undefined}
      className={demo ? 'cursor-not-allowed' : undefined}
    >
      <span className={cn('inline-flex items-center gap-2', demo && 'opacity-50')}>
        {laeuft ? <Loader2 className="animate-spin" aria-hidden="true" /> : <RefreshCw aria-hidden="true" />}
        {laufttext(laeuft, schritt)}
      </span>
    </Button>
  );

  // Das fehlende Token steht als Alert in App.tsx (`AktualisierenHinweise`).
  return demo ? <MitDemoGrund>{aktualisieren}</MitDemoGrund> : aktualisieren;
}

function laufttext(laeuft: boolean, schritt: LaufSchritt | null): string {
  if (!laeuft) return de.aktualisieren.knopf;
  return schritt === null ? de.aktualisieren.laeuft : de.aktualisieren.schritt(de.aktualisieren.schritte[schritt]);
}

/** Haengt den Demo-Grund als Popover an den Knopf, der ihn erklaert. */
function MitDemoGrund({ children }: { readonly children: ReactNode }) {
  return (
    <Popover>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent aria-label={de.aktualisieren.knopf}>
        <p>{de.aktualisieren.demo}</p>
      </PopoverContent>
    </Popover>
  );
}

/** Der Ablaufstatus der Anmeldung, gemeldet an `Seite` fuer die Alert-Reihe in App.tsx. */
export type McpAnmeldungStatus = {
  readonly noetig: boolean;
  /** Noch nie angemeldet (kein Token auf diesem Rechner) — schon vor dem ersten Lauf bekannt. */
  readonly erstmals: boolean;
  readonly laeuft: boolean;
  readonly erfolg: boolean;
  readonly fehler: { readonly code: string; readonly text: string } | null;
  /** Dieselbe Anmelde-Mutation wie der Knopf oben — fuer den Action-Button im Alert. */
  readonly onAnmelden: () => void;
  /** Dieselbe Aktualisieren-Mutation wie der Knopf oben — fuer den Action-Button im Alert. */
  readonly onAktualisieren: () => void;
};

export type AktualisierenProps = {
  /** Ruft bei jeder Aenderung des Anmeldeablaufs auf — fuer die Alert-Reihe in App.tsx. */
  readonly onAnmeldungStatus?: (status: McpAnmeldungStatus) => void;
  /** Blendet nur den Knopf aus, solange ein Alert dieselbe Aktion anbietet; der Zustand bleibt hier. */
  readonly verborgen?: boolean;
};

/**
 * Der Lauf, auf den ein Klick wartet. Ein blosses `true` reichte nicht: der Cache haelt
 * beim Klick noch die Antwort von `/api/lauf` fuer den VORIGEN Lauf, und deren Status
 * ist bereits ein Endstatus. Ohne die Nummer haette der Effekt unten diesen alten
 * Endstatus fuer das Ende des eben gestarteten Laufs gehalten und die Abfrage sofort
 * wieder abgeschaltet — der Lauf lief dann auf dem Server, ohne dass die Oberflaeche
 * ihn zeigte.
 */
type BeobachteterLauf = {
  /** Nummer aus `POST /api/refresh`; `null`, wenn der Server sie nicht abwarten konnte. */
  readonly laufId: number | null;
  /**
   * Die Nummer des bereits BEENDETEN Laufs, der vor dem Klick angezeigt wurde — der
   * Vergleichspunkt fuer den Fall ohne Nummer. `null`, wenn vorher gar keiner oder ein
   * noch laufender angezeigt wurde: dann ist der naechstbeste angezeigte Lauf unserer.
   */
  readonly vorher: number | null;
};

export function Aktualisieren({ onAnmeldungStatus, verborgen = false }: AktualisierenProps) {
  const queryClient = useQueryClient();
  const [beobachtet, setBeobachtet] = useState<BeobachteterLauf | null>(null);
  const [anmeldungAktiv, setAnmeldungAktiv] = useState(false);
  // Erst ein Versuch in dieser Sitzung macht "angemeldet" zu einer Erfolgsmeldung —
  // sonst stuende sie nach jedem Neuladen da.
  const [anmeldungVersucht, setAnmeldungVersucht] = useState(false);
  const kannAktualisieren = tokenVorhanden();
  const demo = istDemoModus();
  const laufAktiv = beobachtet !== null;

  const laufQuery = useQuery({
    queryKey: schluessel.lauf,
    queryFn: api.lauf,
    refetchInterval: laufAktiv ? ABFRAGE_MS : false,
    staleTime: 0,
    retry: false,
  });

  // Einmal beim Laden, damit eine fehlende Anmeldung vor dem ersten Lauf sichtbar ist;
  // wiederholt nur, solange ein Anmeldeversuch laeuft.
  const anmeldungQuery = useQuery({
    queryKey: schluessel.mcpAnmeldung,
    queryFn: api.mcpAnmeldung,
    enabled: !demo && kannAktualisieren,
    refetchInterval: anmeldungAktiv ? ABFRAGE_MS : false,
    staleTime: 0,
    retry: false,
  });

  const starten = useMutation({
    mutationFn: api.refresh,
    onSuccess: (ergebnis) => {
      // 202 nennt den eben gestarteten Lauf, 409 den, der schon laeuft — in beiden
      // Faellen ist es der Lauf, auf den dieser Klick von nun an wartet. `0` heisst
      // "der Server hat die Nummer nicht mehr abgewartet".
      const zuvor = queryClient.getQueryData<Lauf>(schluessel.lauf) ?? null;
      setBeobachtet({
        laufId: ergebnis.laufId > 0 ? ergebnis.laufId : null,
        vorher: zuvor !== null && zuvor.status !== 'laufend' ? zuvor.laufId : null,
      });
      // Im Cache steht noch die Antwort von vor dem Klick. Sofort neu holen, sonst
      // bliebe der Fortschritt bis zum ersten Takt der Abfrage leer.
      void queryClient.invalidateQueries({ queryKey: schluessel.lauf });
    },
    onError: (fehler) => {
      setBeobachtet(null);
      toastFehler(de.aktualisieren.startGescheitert, fehler);
    },
  });

  const anmelden = useMutation({
    mutationFn: api.mcpAnmeldenStarten,
    onSuccess: (ergebnis) => {
      // Sonst stuende im Cache noch `laeuft: false` von vor dem Klick, und der Effekt
      // unten schaltete die Abfrage ab, bevor sie einmal lief.
      queryClient.setQueryData(schluessel.mcpAnmeldung, ergebnis);
      setAnmeldungAktiv(true);
      setAnmeldungVersucht(true);
    },
    onError: (fehler) => {
      setAnmeldungAktiv(false);
      toastFehler(de.aktualisieren.anmeldungStartGescheitert, fehler);
    },
  });

  const gezeigteLaufId = laufQuery.data?.laufId ?? null;
  const status = laufQuery.data?.status ?? null;

  /**
   * Zeigt `/api/lauf` schon den Lauf, auf den dieser Klick wartet? Solange nicht, ist
   * dort noch der Lauf von VOR dem Klick zu sehen — dessen Endstatus gehoert nicht hierher.
   */
  const unsererLauf =
    beobachtet !== null &&
    (beobachtet.laufId !== null
      ? gezeigteLaufId === beobachtet.laufId
      : gezeigteLaufId !== null && gezeigteLaufId !== beobachtet.vorher);

  // Ein Lauf, der schon beim Laden der Seite unterwegs ist — meist der erste aus `npm start`,
  // der Browser oeffnet sich vor dessen Ende [ADR-039]. Ohne Uebernahme sprange nichts an,
  // und die leeren Kacheln blieben bis zum Neuladen leer.
  useEffect(() => {
    if (beobachtet !== null || status !== 'laufend' || gezeigteLaufId === null) return;
    setBeobachtet({ laufId: gezeigteLaufId, vorher: null });
  }, [beobachtet, status, gezeigteLaufId]);

  useEffect(() => {
    if (!unsererLauf) return;
    if (status === null || status === 'laufend') return;
    setBeobachtet(null);
    // Der Lauf ist zu Ende: alles neu holen, nichts aus dem Cache stehen lassen.
    void queryClient.invalidateQueries();
    // Die Toast bestaetigt nur den Klick; die Einzelheiten stehen in der Alert-Reihe.
    if (status === 'erfolg') toast.success(de.aktualisieren.erfolgreich);
    else if (status === 'teilweise')
      toast.warning(de.aktualisieren.teilweise, { description: de.aktualisieren.teilweiseBeschreibung });
    else toast.error(de.aktualisieren.gescheitert);
  }, [unsererLauf, status, queryClient]);

  const anmeldungLaeuftLautServer = anmeldungQuery.data?.laeuft;

  useEffect(() => {
    if (!anmeldungAktiv) return;
    if (anmeldungLaeuftLautServer !== false) return;
    setAnmeldungAktiv(false);
  }, [anmeldungAktiv, anmeldungLaeuftLautServer]);

  const lauf = laufQuery.data;
  const laeuft = laufAktiv || starten.isPending;
  const schritt = unsererLauf && status === 'laufend' ? (lauf?.schritt ?? null) : null;
  const schrittText = schritt === null ? null : de.aktualisieren.schritte[schritt];
  const anmeldung = anmeldungQuery.data;
  const anmeldungLaeuft = anmeldungAktiv || anmelden.isPending;
  const fehler = lauf?.fehler ?? null;
  const erstmals = !laeuft && anmeldung !== undefined && !anmeldung.angemeldet && !anmeldung.laeuft;
  const anmeldungNoetig = erstmals || (!laeuft && fehler !== null && fehler.code === ANMELDUNG_NOETIG);
  const anmeldungErfolg =
    anmeldungVersucht && !anmeldungLaeuft && anmeldung !== undefined && anmeldung.angemeldet && anmeldung.fehler === null;
  const anmeldungFehler = anmeldungLaeuft ? null : (anmeldung?.fehler ?? null);

  // Nur die `mutate`-Funktionen, nicht die `useMutation`-Ergebnisse: die sind bei jedem
  // Render neu, und der Effekt setzt oben State — sonst eine Endlosschleife im Leerlauf.
  const anmeldenMutate = anmelden.mutate;
  const startenMutate = starten.mutate;

  useEffect(() => {
    onAnmeldungStatus?.({
      noetig: anmeldungNoetig,
      erstmals,
      laeuft: anmeldungLaeuft,
      erfolg: anmeldungErfolg,
      fehler: anmeldungFehler,
      onAnmelden: () => anmeldenMutate(),
      onAktualisieren: () => startenMutate(),
    });
  }, [
    anmeldungNoetig,
    erstmals,
    anmeldungLaeuft,
    anmeldungErfolg,
    anmeldungFehler,
    onAnmeldungStatus,
    anmeldenMutate,
    startenMutate,
  ]);

  // Die Region steht dauerhaft und leer im DOM, auch bei ausgeblendetem Knopf: eine erst
  // mit Text eingefuegte Live-Region lesen viele Screenreader nicht vor (WCAG 4.1.3).
  // Das Ende melden die Toasts, deren Region sonner ebenfalls dauerhaft haelt.
  return (
    <>
      <p role="status" className="sr-only">
        {!laeuft ? '' : schrittText === null ? de.aktualisieren.laeuftStatus : de.aktualisieren.laeuftSchrittStatus(schrittText)}
      </p>
      {verborgen ? null : (
        <AktualisierenAnsicht
          kannAktualisieren={kannAktualisieren}
          demo={demo}
          laeuft={laeuft}
          schritt={schritt}
          anmeldungNoetig={anmeldungNoetig}
          anmeldungLaeuft={anmeldungLaeuft}
          onKlick={() => {
            starten.mutate();
          }}
        />
      )}
    </>
  );
}

function toastFehler(titel: string, fehler: Error): void {
  toast.error(titel, { description: fehler instanceof ApiFehler ? (fehler.hinweis ?? fehler.message) : fehler.message });
}
