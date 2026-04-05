/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        'duotone-bold-extended': ['Duotone Bold Extended', 'sans-serif'],
        'duotone-bold':          ['Duotone Bold', 'sans-serif'],
        'duotone-regular':       ['Duotone Regular', 'sans-serif'],
        'duotone-light-condensed': ['Duotone Light Condensed', 'sans-serif'],
        'duotone-medium-condensed': ['Duotone Medium Condensed', 'sans-serif'],
        'gotham':                ['Gotham', 'sans-serif'],
        'gotham-bold':           ['Gotham Bold', 'sans-serif'],
        'gotham-medium':         ['Gotham Medium', 'sans-serif'],
        'gotham-light':          ['Gotham Light', 'sans-serif'],
      },
      colors: {
        'antrasit':    '#4b4f54',
        'duotone-blue': '#00a8c4',
      },
      animation: {
        blob: "blob 7s infinite",
      },
      keyframes: {
        blob: {
          "0%": {
            transform: "translate(0px, 0px) scale(1)",
          },
          "33%": {
            transform: "translate(30px, -50px) scale(1.1)",
          },
          "66%": {
            transform: "translate(-20px, 20px) scale(0.9)",
          },
          "100%": {
            transform: "translate(0px, 0px) scale(1)",
          },
        },
      },
    },
  },
  plugins: [
    require('tailwind-scrollbar')({ nocompatible: true }),
  ],
};
