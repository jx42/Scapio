/*
 * Symbol in der Ringmitte von „Länder & Sektoren“, je Gruppe. Gesucht wird unter dem Rohnamen und
 * unter dem angezeigten Namen: die Anbieter liefern GICS-Sektoren englisch, iShares deutsch und in
 * eigenen Kurzformen. „Übrige“ bekommt die Erdkugel, ein unbekannter Sektor ebenso, ein Land seine Flagge.
 */

import {
  Banknote,
  Building2,
  Cpu,
  Earth,
  Factory,
  Fuel,
  HeartPulse,
  Landmark,
  type LucideIcon,
  Pickaxe,
  RadioTower,
  ShoppingBag,
  ShoppingBasket,
  Zap,
} from 'lucide-react';

import { de } from '@/i18n/de';
import type { RingSymbol } from '@/components/Ring';
import { flagge } from '@/lib/flaggen';

const SEKTOR_SYMBOLE: Readonly<Partial<Record<string, LucideIcon>>> = {
  'information technology': Cpu,
  informationstechnologie: Cpu,
  it: Cpu,
  financials: Landmark,
  finanzwerte: Landmark,
  finanzen: Landmark,
  finanzwesen: Landmark,
  'health care': HeartPulse,
  gesundheitswesen: HeartPulse,
  gesundheit: HeartPulse,
  gesundheitsversorgung: HeartPulse,
  'consumer discretionary': ShoppingBag,
  'nicht-basiskonsumgueter': ShoppingBag,
  'nicht-basiskonsumgüter': ShoppingBag,
  'zyklischer konsum': ShoppingBag,
  'zyklische konsumgüter': ShoppingBag,
  'zyklische konsumgueter': ShoppingBag,
  'consumer staples': ShoppingBasket,
  basiskonsumgueter: ShoppingBasket,
  basiskonsumgüter: ShoppingBasket,
  'nichtzyklische konsumgüter': ShoppingBasket,
  'nichtzyklische konsumgueter': ShoppingBasket,
  communication: RadioTower,
  'communication services': RadioTower,
  kommunikation: RadioTower,
  kommunikationsdienste: RadioTower,
  telekommunikation: RadioTower,
  industrials: Factory,
  industrie: Factory,
  energy: Fuel,
  energie: Fuel,
  materials: Pickaxe,
  materialien: Pickaxe,
  rohstoffe: Pickaxe,
  utilities: Zap,
  versorger: Zap,
  versorgungsbetriebe: Zap,
  'real estate': Building2,
  immobilien: Building2,
  'cash and/or derivatives': Banknote,
  'cash und/oder derivate': Banknote,
  'cash und derivate': Banknote,
};

export function sektorSymbol(name: string | null): LucideIcon {
  if (name === null) return Earth;
  return (
    SEKTOR_SYMBOLE[name.trim().toLowerCase()] ?? SEKTOR_SYMBOLE[de.top25.sektor(name).toLowerCase()] ?? Earth
  );
}

/** Flagge des Landes; ein Land ohne hinterlegte Flagge bekommt die Erdkugel. */
export function landSymbol(name: string | null): RingSymbol {
  if (name === null) return Earth;
  const gefunden = flagge(name);
  return gefunden === undefined ? Earth : { flagge: gefunden };
}
