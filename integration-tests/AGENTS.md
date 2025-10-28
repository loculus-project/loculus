Here is a good example of how to run tests against main:

```sh
PLAYWRIGHT_TEST_BASE_URL=https://main.loculus.org npx playwright test --reporter=list
```

## Checklist before committing code

Run `npm run format` to ensure proper formatting and linting before committing.

## Preventing flaky Playwright tests

If tests are flaky due to race conditions where Playwright interacts with elements before React hydration completes, ensure the website uses hydration-aware wrappers:

- **For buttons**: The website should use `Button` from `src/components/common/Button.tsx`
- **For Headless UI Combobox**: The website should import from `src/components/common/headlessui/Combobox.tsx`
- **For other interactive elements**: The website should use `DisabledUntilHydrated` or `useClientFlag`

These wrappers automatically disable components until client-side hydration is complete, preventing race conditions in tests.
