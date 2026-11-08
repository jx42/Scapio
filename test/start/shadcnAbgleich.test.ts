/** Abgleich mit der shadcn-Registry, ohne Netz: Normalisierung, Zeilenzaehlung, Form der Antwort. */

import { describe, expect, it } from 'vitest';
import { abweichung, normalisiert, registryInhalt } from '../../start/shadcnAbgleich.ts';

describe('shadcn-Abgleich', () => {
  it('Anfuehrungszeichen, Semikolon, Leerraum, Kommentare und "use client" zaehlen nicht', () => {
    const registry = '"use client"\n\nimport * as React from "react";\nfunction  A() {\n  return 1;\n}\n';
    const hier = "// Kopfkommentar\nimport * as React from 'react'\nfunction A() {\n    return 1\n}";
    expect(normalisiert(hier)).toEqual(normalisiert(registry));
  });

  it('zaehlt Zeilen nur hier und nur in der Registry', () => {
    expect(abweichung(['a', 'b', 'x', 'c'], ['a', 'b', 'c', 'y', 'z'])).toEqual({ nurHier: 1, nurDort: 2 });
    expect(abweichung([], ['a'])).toEqual({ nurHier: 0, nurDort: 1 });
  });

  it('nimmt den Inhalt der ersten Datei, sonst null', () => {
    expect(registryInhalt({ files: [{ path: 'ui/button.tsx', content: 'x' }] })).toBe('x');
    expect(registryInhalt({ files: [] })).toBeNull();
    expect(registryInhalt({ files: [{ content: 1 }] })).toBeNull();
    expect(registryInhalt({ name: 'button' })).toBeNull();
    expect(registryInhalt(null)).toBeNull();
  });
});
