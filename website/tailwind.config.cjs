/** @type {import('tailwindcss').Config} */

const flowbite = require('flowbite-react/tailwind');

const mainTailwindColor = {
    50: '#f2f9fd',
    100: '#e4f1fa',
    200: '#c3e3f4',
    300: '#8eceeb',
    400: '#52b4de',
    500: '#2b9bcc',
    600: '#1c7dad',
    700: '#18638b',
    800: '#185574',
    900: '#194761',
    950: '#112d40',
    1500: '#25506e',
};

module.exports = {
    content: ['./src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}', flowbite.content()],
    theme: {
        extend: {
            colors: {
                primary: { ...mainTailwindColor, DEFAULT: mainTailwindColor[400] },
                logoSecondary: mainTailwindColor[600],
                main: mainTailwindColor[600],
            },
        },
    },
    plugins: [
        require('daisyui'),
        flowbite.plugin(),
        require('@tailwindcss/forms')({
            strategy: 'class',
        }),
    ],
    darkMode: 'false',
    daisyui: {
        darkTheme: 'customTheme', // name of one of the included themes for dark mode
        base: true, // applies background color and foreground color for root element by default
        styled: true, // include daisyUI colors and design decisions for all components
        utils: true, // adds responsive and modifier utility classes
        rtl: false, // rotate style direction from left-to-right to right-to-left. You also need to add dir="rtl" to your html tag and install `tailwindcss-flip` plugin for Tailwind CSS.
        prefix: '', // prefix for daisyUI classnames (components, modifiers and responsive class names. Not colors)
        logs: false, // Shows info about daisyUI version and used config in the console when building your CSS
        themes: [
            {
                customTheme: {
                    'secondary': '#f000b8',
                    'accent': '#1dcdbc',
                    'base-100': '#ffffff',
                    'info': '#9ab9bd',
                    'success': '#36d399',
                    'warning': '#fbbd23',
                    'error': '#f87272',
                },
            },
        ],
    },
};
