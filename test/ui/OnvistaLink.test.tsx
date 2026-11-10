// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';

import { de } from '@/i18n/de';
import { OnvistaLink } from '@/components/OnvistaLink';

describe('OnvistaLink', () => {
  it('verlinkt eine gueltige ISIN in einem neuen Tab ohne Referrer', () => {
    render(<OnvistaLink isin="IE00B4L5Y983" name="World">IE00B4L5Y983</OnvistaLink>);

    const link = screen.getByRole('link', { name: de.aufteilung.onvistaOeffnen('World') });
    expect(link).toHaveAttribute('href', 'https://www.onvista.de/suche?searchValue=IE00B4L5Y983');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('zeigt bei allem anderen nur den Text', () => {
    render(<OnvistaLink isin="javascript:alert(1)" name="Cash">Cash</OnvistaLink>);

    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.getByText('Cash')).toBeInTheDocument();
  });
});
