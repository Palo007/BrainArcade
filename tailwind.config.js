/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'nes-red': '#FC8080',
        'nes-blue': '#40C0FF',
        'nes-purple': '#8040FF',
        'nes-green': '#00C020',
        'nes-yellow': '#FCC060',
        'nes-dark': '#282828',
        'nes-gray': '#505050',
      },
      fontFamily: {
        'press-start': ['"Press Start 2P"', 'cursive'],
      },
    },
  },
  plugins: [],
}
