import { describe, expect, it } from 'vitest';
import { jahrAusCommitZeit, mitReleaseJahr } from '../../start/demoExport.ts';

describe('Release-Jahr im Demo-Abzug [ADR-069]', () => {
  it('nimmt das Berliner Jahr des Commits, nicht das UTC-Jahr', () => {
    expect(jahrAusCommitZeit('1767221999\n')).toBe('2025'); // 2025-12-31 22:59:59 UTC
    expect(jahrAusCommitZeit('1767222000\n')).toBe('2026'); // 2025-12-31 23:00:00 UTC = Mitternacht in Berlin
    expect(() => jahrAusCommitZeit('')).toThrow();
  });

  it('setzt das Meta-Tag in den Kopf und nimmt nur ein Jahr an', () => {
    expect(mitReleaseJahr('<head></head>', '2026')).toBe('<head><meta name="release-jahr" content="2026"></head>');
    expect(() => mitReleaseJahr('<head></head>', '"><script>')).toThrow();
  });
});
