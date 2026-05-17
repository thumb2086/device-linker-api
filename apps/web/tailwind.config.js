/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: '#fcc025',
        background: '#0e0e0e',
      },
      fontFamily: {
        sans: ['Manrope', 'sans-serif'],
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0', transform: 'translateY(8px) translateX(-50%)' },
          '100%': { opacity: '1', transform: 'translateY(0) translateX(-50%)' },
        },
      },
      animation: {
        fadeIn: 'fadeIn 0.3s ease-out',
      }
    },
  },
  plugins: [],
}
