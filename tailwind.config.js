/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        terminal: {
          950: '#06080d',
          900: '#0b0f17',
          850: '#111724',
          800: '#172033',
          700: '#23304c',
          600: '#334466',
        },
        trade: {
          green: '#00e676',
          greenMuted: '#00c853',
          greenDark: 'rgba(0, 230, 118, 0.12)',
          red: '#ff1744',
          redMuted: '#d50000',
          redDark: 'rgba(255, 23, 68, 0.12)',
          atm: '#3b82f6',
          atmBg: 'rgba(59, 130, 246, 0.14)',
          itmCe: 'rgba(234, 179, 8, 0.08)',
          itmPe: 'rgba(168, 85, 247, 0.08)',
        }
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'Fira Code', 'Courier New', 'monospace'],
        sans: ['Inter', 'system-ui', 'sans-serif'],
      }
    },
  },
  plugins: [],
};
