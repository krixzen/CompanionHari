/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      screens: {
        // Below this the header has to choose between the wordmark and the nav.
        xs: '430px',
      },
      fontFamily: {
        sans: ['"Inter var"', 'Inter', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
      colors: {
        // A calm, warm palette — closer to a notebook than a dashboard.
        ink: {
          DEFAULT: '#2f3542',
          soft: '#5a6172',
          faint: '#8b91a1',
        },
        paper: {
          DEFAULT: '#fbfaf7',
          raised: '#ffffff',
          sunk: '#f3f1eb',
        },
        sage: {
          50: '#f2f7f4',
          100: '#e0ece5',
          200: '#c2d9cd',
          300: '#98bfae',
          400: '#6fa48e',
          500: '#4f8a73',
          600: '#3d6f5c',
          700: '#33594b',
          800: '#2b473e',
          900: '#253b34',
        },
      },
      borderRadius: {
        xl2: '1.25rem',
      },
      boxShadow: {
        soft: '0 1px 2px rgba(47, 53, 66, 0.04), 0 8px 24px rgba(47, 53, 66, 0.06)',
      },
    },
  },
  plugins: [],
};
