import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Pitt Script identity — Pitt Royal #003594 + Pitt Gold #FFB81C only.
        // All blues are darkenings/lightenings of Pitt Royal, no Heritage Navy.
        pitt: {
          blue: '#003594',     // Pitt Royal (PMS 287 C) — primary
          blueDk: '#001f5c',   // Royal-darkened
          blueLt: '#1f4ea3',   // Royal-lightened (hovers)
          deep: '#00133d',     // Modal backgrounds
          edge: '#00081f',     // Page edges
          gold: '#FFB81C',     // Pitt Gold (PMS 1235 C) — accent
          goldDk: '#cc9213',   // Gold-darkened
        },
        card: {
          face: '#fdfcf7',
          back: '#001f5c',
        },
      },
      fontFamily: {
        display: ['var(--font-display)', 'ui-serif', 'Georgia', 'serif'],
        body: ['var(--font-body)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        card: '0 4px 12px rgba(0,0,0,0.35), 0 1px 2px rgba(0,0,0,0.25)',
        cardHover: '0 12px 24px rgba(0,0,0,0.45), 0 2px 6px rgba(0,0,0,0.3)',
      },
      keyframes: {
        deal: {
          '0%': { transform: 'translate(0,-30vh) rotate(-15deg)', opacity: '0' },
          '100%': { transform: 'translate(0,0) rotate(0)', opacity: '1' },
        },
        play: {
          '0%': { transform: 'translate(var(--from-x,0), var(--from-y,0))' },
          '100%': { transform: 'translate(0,0)' },
        },
      },
      animation: {
        deal: 'deal 350ms ease-out both',
        play: 'play 250ms ease-out both',
      },
    },
  },
  plugins: [],
};
export default config;
