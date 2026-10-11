// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { de } from '@/i18n/de';
import { Driftbanner } from '@/components/Driftbanner';
import { rendern } from './hilfen';
import { drift } from './fixtures';

const BANNER_DRIFT = drift('banner', { abweichung: 0.008 });

describe('Driftbanner', () => {
  it('zeigt die Erklaerung erst im Popover, nicht staendig sichtbar', () => {
    rendern(<Driftbanner drift={BANNER_DRIFT} />);
    expect(screen.queryByText(de.drift.erklaerung)).not.toBeInTheDocument();
  });

  it('zeigt Erklaerung und technischen Hinweis, sobald der Info-Knopf gedrueckt wird', async () => {
    rendern(<Driftbanner drift={BANNER_DRIFT} />);

    const knopf = screen.getByRole('button', {
      name: `${de.erklaerungOeffnen}: ${de.drift.titelBanner}`,
    });
    await userEvent.click(knopf);

    await waitFor(() => {
      expect(screen.getByText(de.drift.erklaerung)).toBeInTheDocument();
    });
    expect(screen.getByText(de.drift.handlung)).toBeInTheDocument();
  });
});
