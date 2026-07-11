import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './lib/**/*.{js,ts,jsx,tsx,mdx}',
    './hooks/**/*.{js,ts,jsx,tsx,mdx}'
  ],
  theme: {
    extend: {
      colors: {
        surface: {
          950: '#0f1115',
          900: '#161a21',
          800: '#1a1f28',
          700: '#222833',
          600: '#2a3140',
          500: '#3a4458'
        },
        ink: {
          DEFAULT: '#eef1f6',
          muted: '#a8b0c0',
          dim: '#7a8496'
        },
        amber: {
          300: '#f0c96a',
          400: '#e8b84a',
          500: '#d4a63a'
        }
      },
      fontFamily: {
        sans: ['var(--font-inter)', 'system-ui', 'sans-serif']
      },
      boxShadow: {
        panel: '0 4px 24px rgba(0,0,0,0.35)'
      }
    }
  },
  plugins: []
};

export default config;
