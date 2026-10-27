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
          950: 'rgb(var(--terminal-950) / <alpha-value>)',
          900: 'rgb(var(--terminal-900) / <alpha-value>)',
          850: 'rgb(var(--terminal-850) / <alpha-value>)',
          800: 'rgb(var(--terminal-800) / <alpha-value>)',
          700: 'rgb(var(--terminal-700) / <alpha-value>)',
          600: 'rgb(var(--terminal-600) / <alpha-value>)',
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
