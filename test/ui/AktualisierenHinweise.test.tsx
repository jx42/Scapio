// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';

import { de } from '@/i18n/de';
import { AktualisierenHinweise } from '@/components/AktualisierenHinweise';
import { rendern } from './hilfen';

describe('AktualisierenHinweise', () => {
  afterEach(() => {
    document.head.querySelector('meta[name="demo-modus"]')?.remove();
  });

  it('zeigt mit Sitzungstoken nichts', () => {
    const { container } = rendern(<AktualisierenHinweise kannAktualisieren={true} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('meldet ein fehlendes Sitzungstoken als Alert', () => {
    rendern(<AktualisierenHinweise kannAktualisieren={false} />);
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent(de.aktualisieren.keinTokenTitel);
    expect(alert).toHaveTextContent(de.aktualisieren.keinToken);
  });

  it('zeigt in der Demo nichts, auch ohne Sitzungstoken', () => {
    const meta = document.createElement('meta');
    meta.name = 'demo-modus';
    meta.content = 'true';
    document.head.append(meta);
    const { container } = rendern(<AktualisierenHinweise kannAktualisieren={false} />);
    expect(container).toBeEmptyDOMElement();
  });
});
