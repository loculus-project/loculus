# Website Codemods

Information on writing codemods (code transformations) for the Loculus website codebase.

Codemods are scripts that automate repetitive code changes across multiple files. They are useful for large refactors, migrations, or enforcing coding standards.

## Available Codemods

### migrate-button-to-wrapper.cjs

Migrates native `<button>` elements to use the wrapped `<Button>` component from `src/components/common/Button`.

Kept out of source tree to avoid confusion: https://gist.github.com/corneliusroemer/b693fbe71cc812de0b68fe55bf336a4d

## Adding New Codemods

When adding new codemods:

1. Use `.cjs` extension (CommonJS) for compatibility with jscodeshift
2. Add usage instructions in the file header comments
3. Document the codemod in this README
4. Test with `--dry --print` flags before applying
5. Consider edge cases (imports, nesting, file locations)
