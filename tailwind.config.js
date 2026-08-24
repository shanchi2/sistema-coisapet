/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans:    ['Nunito Sans', 'sans-serif'],
        display: ['Nunito', 'sans-serif'],
      },
      colors: {
        // Rosa vibrante — cor principal (do "coisa" no logo)
        rose: {
          50:  '#FFF1F5',
          100: '#FFE0EB',
          200: '#FCA5B8',
          300: '#FB7096',
          400: '#F43F5E',
          500: '#E11D48',
          600: '#BE123C',
          700: '#9F1239',
          800: '#881337',
          900: '#4C0519',
        },
        // Âmbar dourado — cor de destaque (do "pet" no logo)
        amber: {
          50:  '#FFFBEB',
          100: '#FEF3C7',
          200: '#FDE68A',
          300: '#FCD34D',
          400: '#FBBF24',
          500: '#F59E0B',
          600: '#D97706',
          700: '#B45309',
          800: '#92400E',
          900: '#78350F',
        },
        // Azul céu — cor de apoio (da borda do logo)
        sky: {
          50:  '#F0F9FF',
          100: '#E0F2FE',
          200: '#BAE6FD',
          300: '#7DD3FC',
          400: '#38BDF8',
          500: '#0EA5E9',
          600: '#0284C7',
          700: '#0369A1',
          800: '#075985',
          900: '#0C4A6E',
        },
      },
      boxShadow: {
        card:  '0 2px 12px rgba(0, 0, 0, 0.06)',
        modal: '0 8px 40px rgba(0, 0, 0, 0.12)',
        focus: '0 0 0 3px rgba(244, 63, 94, 0.15)',
      },
      borderRadius: {
        '2xl': '16px',
        '3xl': '20px',
      },
    },
  },
  plugins: [],
}
