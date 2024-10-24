// @ts-check

import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import { default as tsParser } from '@typescript-eslint/parser';
import { default as astroParser } from 'astro-eslint-parser';
import eslintPluginAstro from 'eslint-plugin-astro';
import importPlugin from 'eslint-plugin-import';
import reactPlugin from 'eslint-plugin-react';
import hooksPlugin from "eslint-plugin-react-hooks";
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url); // get the resolved path to the file
const __dirname = path.dirname(__filename); // get the name of the directory

export default tseslint.config(
  ...tseslint.configs.recommended,
  ...eslintPluginAstro.configs.recommended,
  {
    ignores: ['dist/', 'tailwind.config.cjs', 'astro.config.mjs', 'colors.cjs'],
  },
  {
    files: ["**/*.ts", "**/*.tsx"],
    languageOptions: {
        parser: tsParser,
        parserOptions: {
            project: 'tsconfig.eslint.json',
            sourceType: 'module',
            tsConfigRootDir: __dirname,
            warnOnUnsupportedTypeScriptVersion: true,
        }
    },
    rules: {
        '@typescript-eslint/adjacent-overload-signatures': 'error',
        '@typescript-eslint/array-type': [
            'error',
            {
                default: 'array',
            },
        ],
        '@typescript-eslint/consistent-type-assertions': 'off',
        '@typescript-eslint/dot-notation': 'error',
        '@typescript-eslint/indent': 'off',
        '@typescript-eslint/member-delimiter-style': [
            'off',
            {
                multiline: {
                    delimiter: 'none',
                    requireLast: true,
                },
                singleline: {
                    delimiter: 'semi',
                    requireLast: false,
                },
            },
        ],
        '@typescript-eslint/naming-convention': [
            'error',
            {
                selector: 'default',
                format: ['camelCase'],
                leadingUnderscore: 'allow',
                trailingUnderscore: 'allow',
            },
            {
                selector: 'variable',
                format: ['camelCase', 'UPPER_CASE', 'PascalCase'],
                leadingUnderscore: 'allow',
                trailingUnderscore: 'allow',
            },
            {
                selector: 'property',
                format: null,
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
        ],
        '@typescript-eslint/no-empty-function': 'error',
        '@typescript-eslint/no-empty-interface': 'error',
        '@typescript-eslint/no-explicit-any': 'off',
        '@typescript-eslint/no-floating-promises': ['error', { ignoreVoid: true }],
        '@typescript-eslint/no-for-in-array': 'error',
        '@typescript-eslint/no-misused-new': 'error',
        '@typescript-eslint/no-namespace': 'error',
        '@typescript-eslint/no-parameter-properties': 'off',
        '@typescript-eslint/no-this-alias': 'error',
        '@typescript-eslint/no-unnecessary-qualifier': 'error',
        '@typescript-eslint/no-unnecessary-type-arguments': 'error',
        '@typescript-eslint/no-unnecessary-type-assertion': 'error',
        '@typescript-eslint/no-unused-expressions': 'error',
        '@typescript-eslint/no-use-before-define': 'off',
        '@typescript-eslint/no-var-requires': 'error',
        '@typescript-eslint/only-throw-error': 'error',
        '@typescript-eslint/prefer-for-of': 'error',
        '@typescript-eslint/prefer-function-type': 'error',
        '@typescript-eslint/prefer-namespace-keyword': 'error',
        '@typescript-eslint/prefer-readonly': 'error',
        '@typescript-eslint/promise-function-async': 'off',
        '@typescript-eslint/quotes': 'off',
        '@typescript-eslint/restrict-plus-operands': 'error',
        '@typescript-eslint/no-unnecessary-condition': 'error',
        'no-unused-vars': 'off', //Note: you must disable base rule if @typescript-eslint/no-unused-vars is enabled
        '@typescript-eslint/no-unused-vars': [
            'error',
            {
                caughtErrors: 'none',
            },
        ],
        '@typescript-eslint/semi': ['off', null],
        '@typescript-eslint/strict-boolean-expressions': [
            'error',
            {
                allowNullableObject: true,
                allowNullableBoolean: false,
                allowNullableString: false,
            },
        ],
        '@typescript-eslint/triple-slash-reference': [
            'error',
            {
                path: 'always',
                types: 'prefer-import',
                lib: 'always',
            },
        ],
        '@typescript-eslint/type-annotation-spacing': 'off',
        '@typescript-eslint/unified-signatures': 'error',
        '@typescript-eslint/no-redeclare': 'error',
        '@typescript-eslint/explicit-member-accessibility': [
            'error',
            {
                overrides: {
                    constructors: 'no-public',
                },
            },
        ],
        '@typescript-eslint/member-ordering': 'error',
        '@typescript-eslint/consistent-type-imports': [
            'error',
            {
                fixStyle: 'inline-type-imports',
            },
        ],
    }
  },
  {
    files: ["**/*.astro"],
    languageOptions: {
        parser: astroParser,
        parserOptions: {
            parser: "@typescript-eslint/parser",
            extraFileExtensions: [".astro"],
            // The script of Astro components uses ESM.
            sourceType: "module",
          }
    },
    rules: {
        '@typescript-eslint/naming-convention': 'off',
        'react/jsx-no-useless-fragment': 'off',
    }
  },
  {
    plugins: {
      'import': importPlugin,
    },
    rules: {
        'import/no-cycle': 'error',
        'import/no-deprecated': 'error',
        'import/no-extraneous-dependencies': 'off',
        'import/no-internal-modules': 'off',
        'import/order': [
            'error',
            {
                'groups': ['builtin', 'external', 'internal'],
                'newlines-between': 'always',
                'alphabetize': { order: 'asc' },
            },
        ],
    }
  },
  {
    plugins: {
      "react-hooks": hooksPlugin,
    },
    rules: {
        'react-hooks/rules-of-hooks': 'error',
        'react-hooks/exhaustive-deps': 'error',
    },
  },
  {
    plugins: {
      'react': reactPlugin,
    },
    rules: {
        'react/jsx-curly-spacing': 'off',
        'react/jsx-equals-spacing': 'off',
        'react/jsx-wrap-multilines': 'off',
        'react/destructuring-assignment': ['error', 'always'],
        'react/function-component-definition': [
            'error',
            {
                namedComponents: 'arrow-function',
                unnamedComponents: 'arrow-function',
            },
        ],
        'react/no-deprecated': 'error',
        'react/no-children-prop': 'error',
        'react/no-is-mounted': 'error',
        'react/no-unstable-nested-components': 'warn',
        'react/forbid-component-props': 'off', // icons accept a style prop
        // Prettier is stubborn, need to accept its rules in case of conflict
        // See https://github.com/loculus-project/loculus/pull/283#issuecomment-1733872357
        'react/self-closing-comp': 'off',
        'react/void-dom-elements-no-children': 'error',
        'react/jsx-boolean-value': ['warn', 'never'],
        'react/jsx-curly-brace-presence': ['warn', 'never'],
        'react/jsx-fragments': ['error', 'syntax'],
        'react/jsx-uses-react': 'error',
        'react/jsx-pascal-case': 'error',
        'react/jsx-no-useless-fragment': 'error',
        'react/no-string-refs': 'error',
    }
  },
  {
    ignores: ['dist/', 'tailwind.config.cjs', 'astro.config.mjs', 'colors.cjs'],

    rules: {
        
        
        
        'arrow-parens': ['off', 'always'],
        'brace-style': ['off', 'off'],
        'comma-dangle': 'off',
        'complexity': 'off',
        'constructor-super': 'error',
        'eol-last': 'off',
        'eqeqeq': ['error', 'smart'],
        'guard-for-in': 'error',
        'id-blacklist': [
            'error',
            'any',
            'Number',
            'number',
            'String',
            'string',
            'Boolean',
            'boolean',
            'Undefined',
            'undefined',
        ],
        'id-match': 'error',
        'linebreak-style': 'off',
        'max-classes-per-file': 'off',
        'max-len': 'off',
        'new-parens': 'off',
        'newline-per-chained-call': 'off',
        'no-bitwise': 'error',
        'no-caller': 'error',
        'no-cond-assign': 'error',
        'no-console': 'error',
        'no-debugger': 'error',
        'no-duplicate-case': 'error',
        'no-duplicate-imports': 'error',
        'no-empty': 'error',
        'no-eval': 'error',
        'no-extra-bind': 'error',
        'no-extra-semi': 'off',
        'no-fallthrough': 'off',
        'no-invalid-this': 'off',
        'no-irregular-whitespace': 'off',
        'no-multiple-empty-lines': 'off',
        'no-new-func': 'error',
        'no-new-wrappers': 'error',
        'no-redeclare': 'off',
        'no-return-await': 'error',
        'no-sequences': 'error',
        'no-sparse-arrays': 'error',
        'no-template-curly-in-string': 'error',
        'no-trailing-spaces': 'off',
        'no-undef-init': 'error',
        'no-unsafe-finally': 'error',
        'no-unused-labels': 'error',
        'no-var': 'error',
        'no-void': ['error', { allowAsStatement: true }],
        'object-shorthand': 'error',
        'one-var': ['error', 'never'],
        'prefer-const': 'error',
        'quote-props': 'off',
        'radix': 'error',
        'space-before-function-paren': 'off',
        'space-in-parens': ['off', 'never'],
        'spaced-comment': [
            'error',
            'always',
            {
                markers: ['/'],
            },
        ],
        'use-isnan': 'error',
        'valid-typeof': 'off',
        
        'no-restricted-imports': [
            'error',
            {
                patterns: ['.*/**/dist'],
            },
        ],
    },
  },
);
