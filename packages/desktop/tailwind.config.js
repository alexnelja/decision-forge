/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/renderer/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        display: ['"Fraunces"', 'ui-serif', 'Georgia', 'serif'],
        sans: ['"IBM Plex Sans"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'monospace']
      },
      colors: {
        ink: {
          DEFAULT: '#f1ece0',
          dim: '#8a8278',
          faint: '#4a453d',
          mute: '#2a2620'
        },
        paper: {
          DEFAULT: '#0d0c0a',
          raised: '#15130f',
          rule: '#2a2620'
        },
        section: {
          mc: '#c4d82e',
          nego: '#e8582b',
          forecast: '#6fa88a'
        }
      },
      letterSpacing: {
        tightest: '-0.04em',
        widest2: '0.35em'
      }
    }
  },
  plugins: []
};
