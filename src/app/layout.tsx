import './globals.css';
import type { Metadata, Viewport } from 'next';
import localFont from 'next/font/local';

// Self-hosted variable fonts (committed under src/fonts) — no network needed
// at build or runtime. These were previously declared in Tailwind but never
// actually loaded, so headings silently fell back to Georgia and body text to
// the system font.
const displayFont = localFont({
  src: '../fonts/cormorant-garamond-latin.woff2',
  weight: '300 700',
  variable: '--font-display',
  display: 'swap',
});
const bodyFont = localFont({
  src: '../fonts/inter-latin.woff2',
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
