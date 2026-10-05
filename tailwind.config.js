// Jetons du design system Cockpit (auparavant dans index.html via le CDN).
/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './index.tsx', './App.tsx', './{pages,components,hooks,contexts,utils}/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Outfit', 'system-ui', 'sans-serif'],
        serif: ['"Playfair Display"', 'Georgia', 'serif'],
        mono: ['"JetBrains Mono"', 'monospace'],
      },
      colors: {
        // Rouge vin, ajusté pour le cockpit (plus profond)
        wine: {
          50: '#fdf6f6', 100: '#fbe9e9', 200: '#f5cfcf', 300: '#eba6a6', 400: '#dc7575',
          500: '#c44545', 600: '#9b1c1c', 700: '#7f1d1d', 800: '#5c1414', 900: '#3d0d0d', 950: '#2a0808',
        },
        // Fond crème
        cream: { 50: '#fcfaf6', 100: '#f5f0e6', 200: '#ebe2cf' },
        paper: { 50: '#fcfaf6', 900: '#1c1917' },
      },
      keyframes: {
        'fade-in': { from: { opacity: '0' }, to: { opacity: '1' } },
        'fade-in-up': { from: { opacity: '0', transform: 'translateY(6px)' }, to: { opacity: '1', transform: 'none' } },
        'slide-up': { from: { transform: 'translateY(100%)' }, to: { transform: 'none' } },
      },
      animation: {
        'fade-in': 'fade-in 200ms ease-out both',
        'fade-in-up': 'fade-in-up 220ms ease-out both',
        'slide-up': 'slide-up 260ms cubic-bezier(.2,.8,.2,1) both',
      },
    },
  },
  plugins: [],
};
