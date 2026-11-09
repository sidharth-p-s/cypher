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
        background: '#090a0c',
        surface: {
          50: '#1a1c22',
          100: '#14161a',
          200: '#101115',
          DEFAULT: '#121418',
        },
        border: {
          subtle: '#1f2228',
          DEFAULT: '#272a33',
          strong: '#363a46',
        },
        accent: {
          DEFAULT: '#3b82f6', // crisp clean technical blue
          hover: '#2563eb',
          subtle: 'rgba(59, 130, 246, 0.1)',
        },
        think: {
          border: '#2a313d',
          bg: '#0e1117',
          text: '#8b949e',
        }
      },
      fontFamily: {
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'Menlo', 'monospace'],
      },
    },
  },
  plugins: [],
}

