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
