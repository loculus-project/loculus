import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommended, // Using spread for the recommended config array
  {
    // This is the new part that provides type information
    languageOptions: {
      parserOptions: {
        project: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // This rule requires the type information from above
      '@typescript-eslint/no-floating-promises': 'error',
    },
  },
);