/**
 * `npm run demo` — derselbe Aufbau wie `npm run dev` (`start/kinder.ts`), nur mit
 * `start/demoServer.ts` als gewatchtem Kind.
 */

import { join, resolve } from 'node:path';
import { PROJEKTWURZEL } from '../shared/konfiguration.ts';
import { starteMitWatch } from './kinder.ts';
import { DEMO_PORT } from './demoServer.ts';

export function haupt(): void {
  starteMitWatch([join(PROJEKTWURZEL, 'start', 'demoServer.ts')], DEMO_PORT);
}

if (import.meta.filename === resolve(process.argv[1] ?? '')) haupt();
