# Integration tests

These are tests of the full Loculus system, following sequences through submission to preprocessing to release in the browser, using Playwright.

## Principles

Here are some current guiding principles for these tests:

- Only use facilities users could use (primarily browser interaction), rather than setting things up with backend calls. This makes it easy for others to understand the tests because they can follow them in the browser.
- All tests should be able to run in parallel. Mostly this can be carried out by creating a separate user/group for each test.

## Organization

The integration tests are organized as follows:

- **tests/fixtures/** - Reusable test fixtures for common setup operations
    - `auth.fixture.ts` - Authentication-related fixtures
    - `group.fixture.ts` - Group creation and management fixtures
    - `sequence.fixture.ts` - Sequence submission fixtures

- **tests/pages/** - Page Object Models (POMs) for interacting with application pages
    - Each file (e.g., `auth.page.ts`, `group.page.ts`) encapsulates interactions with a specific page

- **tests/specs/** - The actual test specifications, organized by feature area

### Test Naming Conventions

- **`.dependent.spec.ts`** - Tests that depend on the creation in advance of a read-only sequence (which is made in Ebola virus sudan, before these tests are run).
- **`.spec.ts`** - Tests that do not depend on the creation of this sequence - these either don't touch sequence data or they create their own sequence data

## Fixtures

There are some fixtures to help with the development of tests:

- `pageWithACreatedUser` creates a user account and logs into it
- `pageWithGroup` inherits from `pageWithACreatedUser` and in addition creates a group for the user

## Running the tests

### Initial Setup

Install dependencies:

```sh
npm ci
npx playwright install --with-deps
```

### Option 1: Running local server

Set up the cluster to test:

```sh
./start-server.sh
```

This server will be running the `main` branch images from the GitHub repository. You can also manually stand up an instance running custom code, as described elsewhere in the repository. Or you can use the approach below to use a preview server.

### Option 2: Run against the remote Loculus preview server

Set the `PLAYWRIGHT_TEST_BASE_URL` environment variable to point to the preview server:

```sh
export PLAYWRIGHT_TEST_BASE_URL='https://[branch_name].loculus.org'
```

Or run tests with the environment variable inline:

```sh
PLAYWRIGHT_TEST_BASE_URL='https://[branch_name].loculus.org' npx playwright test
```

### Run tests

Run the tests:

```sh
npx playwright test
```

## Visual Regression Testing

The integration tests include visual regression testing using Playwright's built-in screenshot comparison feature. Screenshots are automatically taken during test execution and compared against baseline images.

**Note:** Visual regression tests are controlled by the `CHECK_SNAPSHOTS` environment variable. They run automatically in CI, but are skipped by default when running tests locally to avoid platform-specific rendering differences.

### Adding Screenshot Assertions

To add a visual regression test to your test file:

```typescript
import { test, expect } from '@playwright/test';
import { testScreenshot } from '../utils/screenshot';

test('my test', async ({ page }) => {
    await page.goto('/my-page');
    await testScreenshot(page, 'my-page.png');
});
```

### Generating Baseline Screenshots

When you first add a screenshot assertion, run the tests with snapshot checking enabled to generate the baseline:

```sh
CHECK_SNAPSHOTS=true npx playwright test
```

This will create snapshot files in `<test-file>.spec.ts-snapshots/` directories. These are stored using Git LFS.

### Updating Screenshots

#### Locally

When visual changes are intentional (e.g., UI updates), update the baseline screenshots:

```sh
CHECK_SNAPSHOTS=true npx playwright test --update-snapshots
```

#### In CI (Pull Requests)

To update snapshots in a pull request, add the `update-snapshots` label to the PR. This will:

1. Trigger a workflow that runs the integration tests with `--update-snapshots`
2. Commit the updated snapshots back to the PR branch

This is useful when you need to update snapshots for changes made in the PR without having to run the full test suite locally.

### Screenshot Storage

Screenshot baselines are stored with Git LFS to avoid bloating the repository. The `.gitattributes` file is configured to automatically track `**/*-snapshots/**/*.png` files with LFS.

## Formatting and Linting

Run `npm run format` to ensure proper formatting and linting before committing.
