import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: 'class',
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Manrope', 'Arial', 'sans-serif'],
        display: ['Manrope', 'Arial', 'sans-serif'],
      },
      colors: {
        brand: {
          50: '#EEF2FF',
          100: '#E0E7FF',
          200: '#C7D2FE',
          300: '#A5B4FC',
          400: '#818CF8',
          500: '#6366F1',
          600: '#4F46E5',
          700: '#4338CA',
          800: '#3730A3',
          900: '#312E81',
          950: '#1E1B4B',
        },
        primary: '#3B82F6',
        secondary: '#1F2937',
        accent: '#10B981',
      },
      backdropFilter: {
        none: 'none',
        sm: 'blur(4px)',
        md: 'blur(12px)',
        lg: 'blur(16px)',
      },
    },
  },
  plugins: [],
};

export default config;
