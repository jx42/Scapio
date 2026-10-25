import { describe, expect, it } from 'vitest';

import { anteilProzent } from '@/lib/format';

const ohneNbsp = (text: string) => text.replaceAll(' ', ' ');

describe('anteilProzent', () => {
  it('rundet auf eine Nachkommastelle', () => {
    expect(ohneNbsp(anteilProzent(0.1123))).toBe('11,2 %');
  });

  it('zeigt einen winzigen Anteil nicht als null', () => {
    expect(ohneNbsp(anteilProzent(0.0004))).toBe('< 0,1 %');
    expect(ohneNbsp(anteilProzent(0.0005))).toBe('0,1 %');
    expect(ohneNbsp(anteilProzent(0))).toBe('0,0 %');
  });
});
