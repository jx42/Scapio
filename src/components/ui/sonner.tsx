/*
 * shadcn/ui — Sonner (Toast). Ohne next-themes: die Anwendung hat keinen Theme-Schalter,
 * sie ist immer dunkel (`color-scheme: dark` in theme.css) — `theme` steht deshalb fest.
 *
 * Auch ohne das generierte `style`-Attribut der Vorlage: das waere Inline-CSS ausserhalb
 * von <Balken>/<ChartRahmen> [INV-05] und zeigte zudem auf CSS-Variablen (--popover,
 * --border, --radius), die es in diesem Theme gar nicht gibt. Farben kommen stattdessen
 * als Tailwind-Klassen aus den Tokens von theme.css — dieselben vier Farbtoene wie in
 * `components/ui/alert.tsx`.
 *
 * Die Bibliothek legt ihr Grundgeruest (Position, Breite, Uebergaenge) beim Import
 * unbedingt per `<style>` an, egal ob `<Toaster>` je gerendert wird — das braucht zwei
 * eigene Ausnahmen in der CSP (`style-src` in `server/sicherheit.ts`, mit Begruendung
 * dort). Kein zusaetzliches `sonner/dist/styles.css`-Stylesheet daneben: doppelt
 * geladen waere dieselbe Regel zweimal wirksam, ohne Nutzen.
 */
import { Toaster as Sonner, type ToasterProps } from 'sonner';
import { de } from '@/i18n/de';
import { CircleCheckIcon, InfoIcon, TriangleAlertIcon, OctagonXIcon, Loader2Icon } from 'lucide-react';

function Toaster({ ...props }: ToasterProps) {
  return (
    <Sonner
      theme="dark"
      className="toaster group"
      closeButton
      containerAriaLabel={de.dialog.benachrichtigungen}
      richColors
      duration={3000}
      icons={{
        success: <CircleCheckIcon className="size-4 text-gewinn" />,
        info: <InfoIcon className="size-4" />,
        warning: <TriangleAlertIcon className="size-4 text-warnung" />,
        error: <OctagonXIcon className="size-4 text-verlust" />,
        loading: <Loader2Icon className="size-4 animate-spin" aria-hidden="true" />,
      }}
      toastOptions={{
        closeButtonAriaLabel: de.dialog.schliessen,
        classNames: {
          toast: 'schwebend rounded-lg text-text',
          actionButton: 'bg-text text-grund',
          cancelButton: 'bg-rand text-text',
          closeButton: 'bg-transparent border-rand text-text-leise hover:text-text',
        },
      }}
      {...props}
    />
  );
}

export { Toaster };
