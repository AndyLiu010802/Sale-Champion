import type { Config } from 'tailwindcss';

export default {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: '#0a0e1a',
        panel: '#101828',
        'panel-2': '#16203a',
        neon: '#00e5ff',
        'neon-purple': '#a020f0',
        money: '#00ff9d',
        gold: '#ffc800',
        silver: '#b8c2d8',
        bronze: '#cd7f32',
        ink: '#dfe6f2',
        muted: '#a6b8da',
      },
      fontFamily: {
        display: ['var(--font-orbitron)', 'sans-serif'],
        heading: ['var(--font-rajdhani)', 'sans-serif'],
        body: ['var(--font-inter)', 'sans-serif'],
      },
    },
  },
  plugins: [],
} satisfies Config;
