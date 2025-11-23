import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import unicorn from 'eslint-plugin-unicorn';

export default tseslint.config(
    {
        ignores: [
            '**/.playwright/**',
            '**/playwright-report/**',
            '**/test-results/**',
            'eslint.config.mjs',
        ],
    },
    eslint.configs.recommended,
    tseslint.configs.recommendedTypeChecked,
    {
        languageOptions: {
            parserOptions: {
                project: true,
                tsconfigRootDir: import.meta.dirname,
            },
        },
        plugins: { unicorn },
        rules: {
            '@typescript-eslint/no-floating-promises': 'error',
            '@typescript-eslint/await-thenable': 'error',
            '@typescript-eslint/return-await': 'error',
            'unicorn/no-unnecessary-await': 'error',
            'no-empty-pattern': 'off', // Playwright requires a lot of empty destructuring patterns
            'no-restricted-globals': [
                'error',
                {
                    name: 'fetch',
                    message:
                        'Use page.request.get/post/etc instead of fetch. ' +
                        'The Playwright request API ensures requests are properly tracked and provides better debugging.',
                },
            ],
        },
    },
);
