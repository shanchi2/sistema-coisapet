/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: { pixel: ['"Press Start 2P"', 'monospace'], body: ['Nunito', 'system-ui', 'sans-serif'] },
    },
  },
  plugins: [],
}
