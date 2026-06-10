/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: ['Sora', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
        display: ['Cabinet Grotesk', 'Sora', 'sans-serif'],
      },
      colors: {
        brand: {
          50:  '#edf5ff',
          100: '#d0e7ff',
          200: '#a3cfff',
          300: '#64aeff',
          400: '#2a87ff',
          500: '#0062f5',
          600: '#0049d4',
          700: '#0039ab',
          800: '#002e86',
          900: '#001e59',
          950: '#000f30',
        },
        surface: {
          0:   '#ffffff',
          50:  '#f8f9fc',
          100: '#f0f2f8',
          200: '#e4e8f2',
          300: '#cdd3e6',
          400: '#a8b2cc',
          500: '#7a87a8',
          600: '#4e5d80',
          700: '#2e3f64',
          800: '#1a2848',
          900: '#0d1830',
        },
        success: { 50: '#edfaf3', 500: '#22c55e', 600: '#16a34a', 900: '#052e16' },
        warning: { 50: '#fffbeb', 500: '#f59e0b', 600: '#d97706', 900: '#451a03' },
        danger:  { 50: '#fef2f2', 500: '#ef4444', 600: '#dc2626', 900: '#450a0a' },
      },
      borderRadius: {
        '4xl': '2rem',
      },
      boxShadow: {
        card: '0 1px 3px rgba(0,0,0,.06), 0 4px 16px rgba(0,0,0,.04)',
        'card-hover': '0 4px 12px rgba(0,0,0,.08), 0 16px 40px rgba(0,0,0,.06)',
        glow: '0 0 0 3px rgba(0,98,245,.25)',
      },
    },
  },
  plugins: [],
}
