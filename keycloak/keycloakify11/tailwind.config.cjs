/** @type {import('tailwindcss').Config} */
const colors = require("./colors.cjs");

const mainTailwindColor = colors.mainTailwindColor;

module.exports = {
    content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
    theme: {
        extend: {
            colors: {
                primary: { ...mainTailwindColor, DEFAULT: mainTailwindColor[400] },
                logoSecondary: mainTailwindColor[600],
                main: mainTailwindColor[600]
            }
        }
    },
    plugins: []
};
