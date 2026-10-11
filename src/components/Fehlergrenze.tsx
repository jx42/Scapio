/*
 * ErrorBoundary je Kachel.
 *
 * Faellt die Look-Through-Berechnung aus oder zerlegt ein unerwarteter Datenpunkt das
 * Chart, bleibt der Rest der Seite bedienbar. Eine Boundary um die ganze Seite waere
 * bequemer und genau deshalb falsch: sie nimmt einem alles auf einmal weg. [P-06]
 *
 * Als Klassenkomponente, weil React keine andere Bauform dafuer anbietet.
 */

import { Component, type ErrorInfo, type ReactNode } from 'react';

import { de } from '@/i18n/de';
import { FehlerZustand } from '@/components/Zustaende';

type Props = {
  readonly children: ReactNode;
  /** Wird statt der Vorgabe gezeigt, wenn gesetzt. */
  readonly rueckfall?: ReactNode;
};

type State = { readonly gefallen: boolean };

export class Fehlergrenze extends Component<Props, State> {
  override state: State = { gefallen: false };

  static getDerivedStateFromError(): State {
    return { gefallen: true };
  }

  override componentDidCatch(fehler: Error, info: ErrorInfo): void {
    // Ins Entwicklerprotokoll, nicht auf die Seite. Kontostaende stehen hier nicht drin.
    console.error('Kachel gescheitert:', fehler.message, info.componentStack);
  }

  override render(): ReactNode {
    if (!this.state.gefallen) return this.props.children;
    if (this.props.rueckfall !== undefined) return this.props.rueckfall;
    return <FehlerZustand text={de.zustand.abgestuerzt} hinweis={de.zustand.abgestuerztHinweis} />;
  }
}
