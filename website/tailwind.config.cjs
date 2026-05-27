/** @type {import('tailwindcss').Config} */
module.exports = {
    plugins: [require('daisyui')],
    daisyui: {
        darkTheme: 'customTheme',
        base: true,
        styled: true,
        utils: true,
        rtl: false,
        prefix: '',
        logs: false,
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
