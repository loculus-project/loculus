## Checklist before committing code

Run `CI=1 npm run test`, `npm run check-types`, `npm run format`.

Without `CI=1`, vitest thinks it’s in development mode and keeps watching for file changes and doesn't terminate. With `CI=1`, it knows it’s in automation mode, runs once, and exits cleanly.
It's important to add `CI=1` envvar to `npm run test` because otherwise it keeps running in background.

## Website Codemods

Inspiration for writing codemods can be found in [codemods/AGENTS.md](./codemods/AGENTS.md).
