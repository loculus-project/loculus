# Loculus

This website uses [Astro](https://astro.build/) for static site generation and
[React](https://react.dev/) for dynamic components.

## Getting started

Set up an `.env` file, e.g. by copying `.env.example`:

```bash
cp .env.example .env
```

### Local Development

* Install packages: `npm install`
* Generate config files for local testing (requires Helm installed): `../generate_local_test_config.sh`
* Run `npm run start` to start a local development server with hot reloading.

### Unit Tests

Run `npm run test` to execute the unit tests.

### End-to-end Tests

We use [Playwright](https://playwright.dev/) for end-to-end tests.
The e2e tests assume that the website is running on `http://localhost:3000`, e.g. by running `npm run start`.
Run `npm run e2e` to execute the end-to-end tests.

If you run Playwright for the first time, you might need to run `npx playwright install`
and `npx playwright install-deps` first. Playwright will tell you if that's the case.

(!) Note: The e2e tests require a running LAPIS instance with test data. This will be prepared automatically, when the LAPIS instance is empty and otherwise skipped. Some e2e tests assume, this prepared data was the first data to be released. If you run the e2e tests for the first time on a LAPIS instance with existing data that is _NOT_ the prepared data, tests will fail ,and you need to delete the data first. 

### Running The Application

Run `npm run start-server` to build and run the application with the Astro dev server.

#### Configuration

The website is configured via environment variables. They are most conveniently set in the `.env` file.
**Note that Astro requires the environment variables already at build time.**
See `.env.docker` for the required variables.

Furthermore, the website requires config files that need to be present at runtime in the directory
specified in the `CONFIG_DIR` environment variable:
* `config.json`: Contains configuration on the underlying organism. It's similar to the database config file that LAPIS uses.
* `reference_genomes.json`: Defines names for segments of the genome and amino acids. It's equal to the file that LAPIS uses.
* `runtime_config.json`: Contains configuration that specific for a deployed instance of the website.

Check our tests and examples for working config files.

## Logging

The website writes logs to stdout.
If the environment variable LOG_DIR is set, it will also store them in `LOG_DIR/website.log`.

## Development environment

### Editor

- [Astro](https://docs.astro.build/en/editor-setup/)

### Setup

- Install node version from `.nvmrc` with `nvm install`

### General tips
 
- Available scripts can be browsed in [`package.json`](./package.json) or by running `npm run`
- For VS code, use the ESlint extension which must be configured with `"eslint.workingDirectories": ["./website"],` in the settings.json
- Tips & Tricks for using icons from MUI  https://mui.com/material-ui/guides/minimizing-bundle-size/
