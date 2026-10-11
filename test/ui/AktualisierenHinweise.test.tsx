// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';

import { de } from '@/i18n/de';
import { AktualisierenHinweise } from '@/components/AktualisierenHinweise';
import { rendern } from './hilfen';

describe('AktualisierenHinweise', () => {
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
});
