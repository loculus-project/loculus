## Checklist before committing code

Run `npm run test`, `npm run check-types`, `npm run format`.

## Preventing flaky Playwright tests

When adding or modifying interactive components, ensure they are disabled until React hydration completes to prevent race conditions in Playwright tests:

- **For buttons**: Use `Button` from `src/components/common/Button.tsx` instead of native `<button>`
- **For Headless UI Combobox**: Import from `src/components/common/headlessui/Combobox.tsx` instead of `@headlessui/react`
- **For other interactive elements**: Wrap with `DisabledUntilHydrated` or use the `useClientFlag` hook

These wrappers automatically disable components until client-side hydration is complete, preventing Playwright from interacting with them before they're ready.
