/*
 * Ob diese Seite vom Demo-Server kommt (`npm run demo`, synthetisches Depot statt der
 * echten Datenbank). Steht ausschliesslich im <meta name="demo-modus">, das der Server
 * nur in diesem Betrieb einfuegt — in jedem echten Lauf fehlt das Tag ganz.
 */

const META_NAME = 'demo-modus';

export function istDemoModus(): boolean {
  if (typeof document === 'undefined') return false;
  const meta = document.querySelector(`meta[name="${META_NAME}"]`);
  return meta?.getAttribute('content') === 'true';
}
