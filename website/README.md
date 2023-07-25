# Pathoplexus

This website uses [Astro](https://astro.build/) for static site generation and
[React](https://react.dev/) for dynamic components.

## Getting started
1. Set up a `.env` file, e.g. by copying `.env.example`.

### Local Development
Run `npm run start` to start a local development server with hot reloading.

### Unit Tests
Run `npm run test` to execute the unit tests.

### End-to-end Tests
We use [Playwright](https://playwright.dev/) for end-to-end tests.
Run `npm run e2e` to execute the end-to-end tests.

If you run Playwright for the first time, you might need to run `npx playwright install`
and `npx playwright install-deps` first. Playwright will tell you if that's the case.
