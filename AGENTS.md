The `backend`, `website`, and `integration-tests` directories each contain their own `AGENTS.md` files with additional specific instructions.

Use conventional commits as titles for PRs, e.g. feat(deployment):xx, fix!(website):xx, chore(backend):xx.
Components include: website, backend, deployment, preprocessing, ingest, deposition.

Write detailed PR summaries, not just short bullet points. When creating PRs, you should generally create them as a draft PR.

## Preventing flaky Playwright tests (website)

When adding or modifying interactive components in the website, ensure they are disabled until React hydration completes to prevent race conditions in Playwright tests:

- **For buttons**: Use `Button` from `src/components/common/Button.tsx` instead of native `<button>`
- **For Headless UI Combobox**: Import from `src/components/common/headlessui/Combobox.tsx` instead of `@headlessui/react`
- **For other interactive elements**: Wrap with `DisabledUntilHydrated` or use the `useClientFlag` hook

These wrappers automatically disable components until client-side hydration is complete, preventing Playwright from interacting with them before they're ready.

## Updating Conda Environment Dependencies

Conda dependencies in `environment.yml` files are not automatically updated by dependabot.
The `maintenance-scripts/` folder contains utilities to help update conda environment versions.
