# Website Codemods

This directory contains codemods (code transformations) for the Loculus website codebase.

## Available Codemods

### migrate-button-to-wrapper.cjs

Migrates native `<button>` elements to use the wrapped `<Button>` component from `src/components/common/Button`.

**Why:** The wrapped Button component disables buttons until React hydration completes, preventing race conditions in Playwright tests that cause Firefox flakes.

**Usage:**

```bash
# Dry run (preview changes without modifying files)
npx jscodeshift -t codemods/migrate-button-to-wrapper.cjs src \
  --extensions=tsx --parser=tsx --dry --print

# Apply changes to all .tsx files
npx jscodeshift -t codemods/migrate-button-to-wrapper.cjs src \
  --extensions=tsx --parser=tsx

# Apply to specific file
npx jscodeshift -t codemods/migrate-button-to-wrapper.cjs \
  src/components/MyComponent.tsx --extensions=tsx --parser=tsx
```

**What it does:**
- Finds all `<button>` JSX elements (including nested ones)
- Replaces them with `<Button>`
- Adds the correct relative import for Button based on file location
- Skips the Button wrapper component itself
- Preserves all props, attributes, and children

**Example transformation:**

```tsx
// Before
import { useState } from 'react';

function MyComponent() {
  return (
    <div>
      <button onClick={handleClick} disabled={isDisabled}>
        Click me
      </button>
    </div>
  );
}

// After
import { useState } from 'react';
import { Button } from '../common/Button';

function MyComponent() {
  return (
    <div>
      <Button onClick={handleClick} disabled={isDisabled}>
        Click me
      </Button>
    </div>
  );
}
```

**Key features:**
- ✅ Correctly calculates relative import paths for any file location
- ✅ Handles buttons nested at any depth (inside divs, spans, etc.)
- ✅ Skips files that already import Button
- ✅ Preserves all formatting and attributes

## Adding New Codemods

When adding new codemods:

1. Use `.cjs` extension (CommonJS) for compatibility with jscodeshift
2. Add usage instructions in the file header comments
3. Document the codemod in this README
4. Test with `--dry --print` flags before applying
5. Consider edge cases (imports, nesting, file locations)

## Resources

- [jscodeshift documentation](https://github.com/facebook/jscodeshift)
- [AST Explorer](https://astexplorer.net/) - Interactive tool for writing codemods
- [React codemods examples](https://github.com/reactjs/react-codemod)
