import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: 'class',
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        // Groww-inspired palette (Addendum 2, Section C). Key names kept
        // stable (ink.*, signal, gain, loss) so existing className strings
        // across every component still resolve correctly -- only the
        // underlying hex values changed, plus a couple of new tokens.
        ink: {
          DEFAULT: '#0B0F0E',
          50: '#F2F5F3',
          100: '#F2F5F3',
          200: '#C9D2CE',
          300: '#8B9490', // --pulse-text-muted
          400: '#5F6763',
          500: '#3A413E',
          600: '#232B2A', // --pulse-border
          700: '#1C2224', // --pulse-surface-alt
          800: '#14181A', // --pulse-surface
          900: '#0B0F0E', // --pulse-bg
        },
        signal: {
          DEFAULT: '#5DB85D', // Groww green -- the single spent-deliberately accent
          dim: '#2E5C2E',
          low: '#5F6763',
          medium: '#3B82F6', // --pulse-blue: secondary accent, informational badges, AI-brief label
          high: '#E8A33D', // kept distinct from both green and red for the HIGH band specifically
          critical: '#E5484D',
        },
        pulseBlue: '#3B82F6',
        gain: '#5DB85D',
        loss: '#E5484D', // never repurposed for anything but negative movement, per spec
      },
      fontFamily: {
        sans: ['var(--font-inter)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      borderRadius: {
        sm: '3px',
        DEFAULT: '4px',
        md: '6px',
      },
      boxShadow: {
        none: 'none',
      },
    },
  },
  plugins: [],
};

export default config;
