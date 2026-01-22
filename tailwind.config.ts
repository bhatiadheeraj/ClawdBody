import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        'sam': {
          'bg': '#0d0d12',
          'surface': '#161620',
          'surface-light': '#1e1e2a',
          'border': '#2a2a3a',
          'accent': '#ff6b35',
          'accent-dim': '#ff8c5a',
          'accent-soft': '#ff8840',
          'text': '#f5f5f5',
          'text-dim': '#a0a0a8',
          'text-soft': '#b8b8c0',
          'warning': '#ffaa00',
          'error': '#ff4466',
          'success': '#00d4aa',
        }
      },
      fontFamily: {
        'display': ['Syne', 'system-ui', 'sans-serif'],
        'mono': ['JetBrains Mono', 'Fira Code', 'monospace'],
        'body': ['DM Sans', 'system-ui', 'sans-serif'],
      },
      animation: {
        'pulse-slow': 'pulse 3s ease-in-out infinite',
        'glow': 'glow 2s ease-in-out infinite alternate',
        'float': 'float 6s ease-in-out infinite',
      },
      keyframes: {
        glow: {
          '0%': { boxShadow: '0 0 20px rgba(0, 212, 170, 0.3)' },
          '100%': { boxShadow: '0 0 40px rgba(0, 212, 170, 0.6)' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-10px)' },
        },
      },
    },
  },
  plugins: [],
}
export default config


