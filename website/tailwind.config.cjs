/** @type {import('tailwindcss').Config} */
const colors = require('tailwindcss/colors')
const mainTailwindColor = {
  '50': '#f3f6fb',
  '100': '#e4e9f5',
  '200': '#cfdaee',
  '300': '#aec1e2',
  '400': '#88a1d2',
  '500': '#6b84c6',
  '600': '#586bb8',
  '700': '#4d5ba8',
  '800': '#3e467e',
  '900': '#3a416e',
  '950': '#272b44',
};

module.exports = {
  content: ['./src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}'],
  theme: {
    extend: {
      colors: {
        primary: {...mainTailwindColor, DEFAULT: mainTailwindColor[400]},
        logoSecondary: mainTailwindColor[600],
        main: mainTailwindColor[600],
      }
    },
    
  },
  plugins: [require("daisyui"),
  require('flowbite/plugin')],
  darkMode: 'false',
  daisyui: {
    darkTheme: "customTheme", // name of one of the included themes for dark mode
    base: true, // applies background color and foreground color for root element by default
    styled: true, // include daisyUI colors and design decisions for all components
    utils: true, // adds responsive and modifier utility classes
    rtl: false, // rotate style direction from left-to-right to right-to-left. You also need to add dir="rtl" to your html tag and install `tailwindcss-flip` plugin for Tailwind CSS.
    prefix: "", // prefix for daisyUI classnames (components, modifiers and responsive class names. Not colors)
    logs: false, // Shows info about daisyUI version and used config in the console when building your CSS
    themes: [
      {
        customTheme: {
      
          "secondary": "#f000b8",
          "accent": "#1dcdbc",
          "base-100": "#ffffff",
          "info": "#9ab9bd",
          "success": "#36d399",
          "warning": "#fbbd23",
          "error": "#f87272",
        },
      },
    ],
  },


};
