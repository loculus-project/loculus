# Loculus

This website uses [Astro](https://astro.build/) for static site generation and
[React](https://react.dev/) for dynamic components.

## Getting started

In order to run the website locally you will need to install [nodejs](https://nodejs.org). You can do this with [Node Version Manager](https://github.com/nvm-sh/nvm).

### Local Development

-   Set up your `.env` file, e.g. by copying `.env.example` with `cp .env.example .env`
-   Install packages: `npm ci` (`ci` as opposed to `install` makes sure to install the exact versions specified in `package-lock.json`)
-   Generate config files for local testing (requires Helm installed): `../generate_local_test_config.sh`. If you are not running the backend locally, run `../generate_local_test_config.sh --from-live` to point to the backend from the live server (preview of the `main` branch) or `../generate_local_test_config.sh --from-live --live-host main.loculus.org` to specify a particular host which can also be a preview.
-   Run `npm run start` to start a local development server with hot reloading.
-   Run `npm run format-fast` to format the code.

### Unit Tests

Run `npm run test` to execute the unit tests.

### Running The Application

Run `npm run start-server` to build and run the application with the Astro dev server.

#### Configuration

The website is configured via environment variables. They are most conveniently set in the `.env` file.
**Note that Astro requires the environment variables already at build time.**
See `.env.docker` for the required variables.

Furthermore, the website requires config files that need to be present at runtime in the directory
specified in the `CONFIG_DIR` environment variable:

-   `website_config.json`: Contains configuration on the underlying organism. It's similar to the database config file that LAPIS uses.
-   `reference_genomes.json`: Defines names for segments of the genome and amino acids. It's equal to the file that LAPIS uses.
-   `runtime_config.json`: Contains configuration that specific for a deployed instance of the website.

Check our tests and examples for working config files.

## Logging

The website writes logs to stdout.
If the environment variable LOG_DIR is set, it will also store them in `LOG_DIR/website.log`.

## Development environment

### Editor

-   [Astro](https://docs.astro.build/en/editor-setup/)

### Setup

-   Install node version from `.nvmrc` with `nvm install`

### General tips

-   Available scripts can be browsed in [`package.json`](./package.json) or by running `npm run`
-   For VS code, use the ESlint extension which must be configured with `"eslint.workingDirectories": ["./website"],` in the settings.json
-   Tips & Tricks for using icons from MUI https://mui.com/material-ui/guides/minimizing-bundle-size/

### Codemods

Inspiration for writing codemods can be found in [codemods/AGENTS.md](./codemods/AGENTS.md).
