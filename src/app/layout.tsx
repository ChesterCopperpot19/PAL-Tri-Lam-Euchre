import './globals.css';
import type { Metadata, Viewport } from 'next';
import localFont from 'next/font/local';

// Self-hosted variable fonts (committed under src/fonts) — no network needed
// at build or runtime. Per the Pitt Athletics brand: Oswald approximates the
// condensed, collegiate display type, and Archivo stands in for the DINPro
// supporting typeface used for body copy. (The actual Cathedral Font and Pitt
// Script faces are proprietary/licensed, so we use free, on-brand substitutes.)
const displayFont = localFont({
  src: '../fonts/oswald-latin.woff2',
  weight: '200 700',
  variable: '--font-display',
  display: 'swap',
});
const bodyFont = localFont({
  src: '../fonts/archivo-latin.woff2',
  weight: '100 900',
  variable: '--font-body',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'PAL/Tri-Lam Euchre Club',
  description:
    'PAL/Tri-Lam Euchre Club — play Euchre online with the boys (and friends).',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${displayFont.variable} ${bodyFont.variable}`}>
      <body>{children}</body>
    </html>
  );
}
