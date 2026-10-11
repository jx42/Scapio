/*
 * Der Einstieg. Mehr als das steht hier nicht: kein Service Worker, kein Analytics,
 * keine externe Adresse. [INV-11]
 *
 * `StrictMode` bleibt an — die doppelten Renders in der Entwicklung decken genau die
 * Effekte auf, die eine Kachel spaeter im Betrieb zerlegen wuerden.
 */

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import '@/styles/theme.css';
import { AppMitGrenze } from '@/App';

const wurzel = document.getElementById('wurzel');
if (wurzel === null) throw new Error('Kein Element mit der id "wurzel" in der Seite.');

createRoot(wurzel).render(
  <StrictMode>
    <AppMitGrenze />
  </StrictMode>,
);
