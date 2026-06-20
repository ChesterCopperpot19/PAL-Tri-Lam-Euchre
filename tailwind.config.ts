import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Pitt Athletics palette (official ID manual). Primary: Pitt Royal
        // #003594 (PMS 661 C) + Pitt Gold #FFB81C (PMS 1235 C). The darks and
        // grey are the manual's secondary + tonal palette.
        pitt: {
          blue: '#003594',       // Pitt Royal (PMS 661 C) — primary
          blueDk: '#141B4D',     // Dark Royal (PMS 2766 C) — secondary
          blueLt: '#1f4ea3',     // Royal-lightened (hovers; derived tint)
          deep: '#141B4D',       // Modal backgrounds → Dark Royal
          edge: '#0A0C1E',       // Page edges (deep Dark Royal)
          gold: '#FFB81C',       // Pitt Gold (PMS 1235 C) — accent
          goldDk: '#B58500',     // Dark Gold (PMS 125 C)
          grey: '#A2AAAD',       // Grey (PMS 429 C)
          anthracite: '#373A36', // Anthracite (PMS 447 C)
          ink: '#2C2A29',        // Black Neutral (PMS Process Black C)
        },
        card: {
          face: '#fdfcf7',
          back: '#141B4D',
        },
      },
      fontFamily: {
        display: ['var(--font-display)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
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
