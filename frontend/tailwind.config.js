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
        brand: {
          50: '#f0fdfa',
          100: '#ccfbf1',
          200: '#99f6e4',
          300: '#5eead4',
          400: '#2dd4bf', // Electric Teal
          500: '#14b8a6',
          600: '#0d9488',
          700: '#0f766e',
          800: '#115e59',
          900: '#134e4a',
          950: '#042f2e',
        },
        surface: {
          50: '#f8fafc',
          100: '#f1f5f9',
          200: '#e2e8f0',
          300: '#cbd5e1',
          400: '#94a3b8',
          500: '#64748b',
          600: '#475569',
          700: '#334155',
          800: '#1e293b',
          900: '#0f172a', // Charcoal
          950: '#020617', // Deep Midnight Navy
        },
        success: { 400: '#34d399', 500: '#10b981', 600: '#059669' }, // Emerald
        warning: { 400: '#fbbf24', 500: '#f59e0b', 600: '#d97706' }, // Amber
        danger:  { 400: '#fb7185', 500: '#f43f5e', 600: '#e11d48' }, // Rose/Crimson
        info:    { 400: '#38bdf8', 500: '#0ea5e9', 600: '#0284c7' }, // Cyan
      },
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', 'Inter', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'monospace'],
      },
      animation: {
        'fade-in': 'fadeIn 0.5s ease-out forwards',
        'slide-up': 'slideUp 0.4s ease-out forwards',
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'shimmer': 'shimmer 2s linear infinite',
        'copilot-pulse': 'copilotPulse 3s infinite',
        'orb-drift-1': 'orbDrift1 12s ease-in-out infinite',
        'orb-drift-2': 'orbDrift2 16s ease-in-out infinite',
        'orb-drift-3': 'orbDrift3 20s ease-in-out infinite',
        'grid-fade': 'gridFade 8s ease-in-out infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        copilotPulse: {
          '0%, 100%': { opacity: '1', transform: 'scale(1)' },
          '50%': { opacity: '0.8', transform: 'scale(1.02)' },
        },
        orbDrift1: {
          '0%, 100%': { transform: 'translate(0, 0) scale(1)', opacity: '0.3' },
          '33%': { transform: 'translate(4%, 6%) scale(1.05)', opacity: '0.4' },
          '66%': { transform: 'translate(-3%, 2%) scale(0.97)', opacity: '0.25' },
        },
        orbDrift2: {
          '0%, 100%': { transform: 'translate(0, 0) scale(1)', opacity: '0.2' },
          '40%': { transform: 'translate(-5%, -4%) scale(1.08)', opacity: '0.3' },
          '70%': { transform: 'translate(3%, -2%) scale(0.95)', opacity: '0.15' },
        },
        orbDrift3: {
          '0%, 100%': { transform: 'translate(0, 0) scale(1)', opacity: '0.15' },
          '50%': { transform: 'translate(6%, -3%) scale(1.1)', opacity: '0.25' },
        },
        gridFade: {
          '0%, 100%': { opacity: '0.12' },
          '50%': { opacity: '0.22' },
        },
      },
      backdropBlur: {
        xs: '2px',
      },
    },
  },
  plugins: [
    require('@tailwindcss/forms'),
  ],
}
