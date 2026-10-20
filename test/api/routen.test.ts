/**
 * `shared/routen.ts` ist die eine Liste der Routen; der Server registriert genau diese.
 */

import { describe, expect, it } from 'vitest';
import { LESENDE_ROUTEN, MUTIERENDE_ROUTEN } from '../../shared/routen.ts';
import { registrierteRouten } from '../invarianten/quellen.ts';

describe('shared/routen.ts', () => {
  const alle = registrierteRouten();

  it('nennt jede lesende Route, die der Server registriert, und keine weitere', () => {
    const lesend = alle.filter((r) => r.methode === 'get' && r.pfad.startsWith('/api/')).map((r) => r.pfad).sort();
    expect(lesend).toEqual(Object.values(LESENDE_ROUTEN).map((r) => r.pfad).sort());
  });

  it('nennt genau die mutierenden Routen des Servers', () => {
    const mutierend = alle.filter((r) => r.methode === 'post').map((r) => r.pfad).sort();
    expect(mutierend).toEqual(Object.values(MUTIERENDE_ROUTEN).sort());
  });
});
