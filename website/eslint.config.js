import eslint from '@eslint/js';
import { defineConfig } from 'eslint/config';
import tseslint from 'typescript-eslint';
import react from 'eslint-plugin-react';
import parser from '@typescript-eslint/parser';
import eslintPluginAstro from 'eslint-plugin-astro';
import astroParser from 'astro-eslint-parser';
import importPlugin from 'eslint-plugin-import';
import reactHooks from 'eslint-plugin-react-hooks';
import pluginQuery from '@tanstack/eslint-plugin-query';

const importRules = {
    'import/no-cycle': 'error',
    'import/no-deprecated': 'error',
    'import/no-extraneous-dependencies': 'error',
    'import/no-internal-modules': 'off',
    'import/order': [
        'error',
        {
            'groups': ['builtin', 'external', 'internal'],
            'newlines-between': 'always',
            'alphabetize': { order: 'asc' },
        },
    ],
};

const importRulesAstro = {
    ...importRules,
    'import/no-deprecated': 'off',
};

const enableFromEslint = {
    'no-console': 'error',
    'no-restricted-imports': [
        'error',
        {
            paths: [
                {
                    name: '@headlessui/react',
                    importNames: ['Combobox'],
                    message:
                        'Import Combobox from "src/components/common/headlessui/Combobox" instead. ' +
                        'The wrapped version automatically disables the component until hydration completes, ' +
                        'preventing race conditions in Playwright tests.',
                },
            ],
        },
    ],
    'no-restricted-syntax': [
        'error',
        {
            selector: 'JSXElement[openingElement.name.name="button"]',
            message:
                'Use Button from "src/components/common/Button" instead of native <button> elements. ' +
                'The wrapped Button component automatically disables until hydration completes, ' +
                'preventing race conditions in Playwright tests.',
        },
    ],
};

const disableFromTypescriptEsLint = {
    '@typescript-eslint/no-confusing-void-expression': 'off',
    '@typescript-eslint/consistent-type-definitions': 'off',
    '@typescript-eslint/no-unsafe-argument': 'off',
    '@typescript-eslint/consistent-indexed-object-style': 'off',
    '@typescript-eslint/no-unsafe-assignment': 'off',
    '@typescript-eslint/prefer-reduce-type-parameter': 'off',
    '@typescript-eslint/no-empty-function': 'off',
    '@typescript-eslint/triple-slash-reference': 'off',
    '@typescript-eslint/no-inferrable-types': 'off',
    '@typescript-eslint/no-non-null-assertion': 'off',
    '@typescript-eslint/no-redundant-type-constituents': 'off',
    '@typescript-eslint/no-dynamic-delete': 'off',
};

const typescriptEslintConfig = {
    '@typescript-eslint/naming-convention': [
        'error',
        {
            selector: 'default',
            format: ['camelCase'],
            leadingUnderscore: 'allow',
            trailingUnderscore: 'allow',
        },
        {
            selector: 'function',
            format: ['camelCase', 'PascalCase'],
        },
        {
            selector: 'variable',
            format: ['camelCase', 'UPPER_CASE', 'PascalCase'],
            leadingUnderscore: 'allow',
            trailingUnderscore: 'allow',
        },
        {
            selector: 'enumMember',
            format: ['camelCase', 'UPPER_CASE', 'PascalCase'],
        },
        {
            selector: 'import',
            format: null,
        },
        {
            selector: 'typeLike',
            format: ['PascalCase'],
        },
        {
            selector: 'property',
            format: null,
            filter: {
                regex: '^[0-9]+$',
                match: true,
            },
        },
    ],
    '@typescript-eslint/no-unused-vars': [
        'error',
        {
            args: 'all',
            argsIgnorePattern: '^_',
            caughtErrors: 'all',
            caughtErrorsIgnorePattern: '^_',
            destructuredArrayIgnorePattern: '^_',
            varsIgnorePattern: '^_',
            ignoreRestSiblings: true,
        },
    ],
};

const restrictTemplateExpressions = {
    '@typescript-eslint/restrict-template-expressions': [
        'error',
        {
            allowNumber: true,
            allow: [{ name: ['unknown', 'Error', 'URLSearchParams', 'URL'], from: 'lib' }],
        },
    ],
};

const disableFromReact = {
    'react/no-unescaped-entities': 'off',
    'react/display-name': 'off',
    'react/react-in-jsx-scope': 'off',
    'react/jsx-no-target-blank': 'off',
};

export default defineConfig(
    {
        ignores: ['**/.astro/content.d.ts'],
        files: ['**/*.ts', '**/*.tsx'],
        extends: [
            eslint.configs.recommended,
            ...tseslint.configs.strictTypeChecked,
            ...tseslint.configs.stylisticTypeChecked,
        ],
        languageOptions: {
            parser: parser,
            parserOptions: {
                projectService: true,
                tsconfigRootDir: import.meta.dirname,
                ecmaFeatures: {
                    jsx: true,
                },
            },
        },
        plugins: {
            react,
            'import': importPlugin,
            'react-hooks': reactHooks,
        },
        rules: {
            ...react.configs.flat.recommended.rules,
            ...importRules,
            ...typescriptEslintConfig,
            ...restrictTemplateExpressions,
            ...disableFromTypescriptEsLint,
            ...disableFromReact,
            ...enableFromEslint,
        },
        settings: {
            react: {
                version: 'detect',
            },
        },
    },
    {
        files: ['**/*.spec.ts', '**/*.spec.tsx'],
        rules: {
            '@typescript-eslint/no-unsafe-member-access': 'off',
        },
    },
    {
        files: ['**/*.astro'],
        extends: [
            eslint.configs.recommended,
            ...eslintPluginAstro.configs.recommended,
            ...tseslint.configs.strict,
            ...tseslint.configs.stylistic,
        ],
        rules: {
            ...typescriptEslintConfig,
            ...disableFromTypescriptEsLint,
            ...enableFromEslint,
            ...importRulesAstro,
        },
        languageOptions: {
            parser: astroParser,
        },
        plugins: {
            import: importPlugin,
        },
    },
    ...pluginQuery.configs['flat/recommended'],
);
