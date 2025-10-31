## Checklist before committing code

Run `CI=1 npm run test`, `npm run check-types`, `npm run format`.

It's important to add `CI=1` envvar to `npm run test` because otherwise it keeps running in background.
