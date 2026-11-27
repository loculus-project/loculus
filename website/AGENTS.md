## Checklist before committing code

Run `CI=1 npm run test`, `npm run check-types`, `npm run format`.

Without `CI=1`, vitest thinks it’s in development mode and keeps watching for file changes and doesn't terminate. With `CI=1`, it knows it’s in automation mode, runs once, and exits cleanly.
It's important to add `CI=1` envvar to `npm run test` because otherwise it keeps running in background.

Inside the Codex filesystem sandbox, run `CHOKIDAR_USEPOLLING=true npm run check-types`. The Flowbite Astro plugin uses file watchers while Astro loads the config, and polling avoids `EMFILE: too many open files, watch` failures in the sandbox.

## Website Codemods

Inspiration for writing codemods can be found in [codemods/AGENTS.md](./codemods/AGENTS.md).

## Calling the backend and LAPIS

Follow [src/services/README.md](./src/services/README.md) when adding or calling endpoints: define each endpoint once in `src/services/backendApi.ts` or `src/services/lapisApi.ts`, use `serverBackendApi` / `serverLapisApi` server-side and the hooks in `src/hooks/useBackend.ts` / `src/hooks/useLapis.ts` client-side, and show errors with `getErrorMessage`.
