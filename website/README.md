# Pathoplexus

This website uses [Astro](https://astro.build/) for static site generation and
[React](https://react.dev/) for dynamic components.

## Getting started

Set up an `.env` file, e.g. by copying `.env.example`:

```bash
cp .env.example .env
```

### Local Development

Install packages: `npm install`

Run `npm run start` to start a local development server with hot reloading.

### Unit Tests

Run `npm run test` to execute the unit tests.

### End-to-end Tests

We use [Playwright](https://playwright.dev/) for end-to-end tests.
The e2e tests assume that the website is running on `http://localhost:3000`, e.g. by running `npm run start`.
Run `npm run e2e` to execute the end-to-end tests.

If you run Playwright for the first time, you might need to run `npx playwright install`
and `npx playwright install-deps` first. Playwright will tell you if that's the case.

### Running The Application

Run `npm run start-server` to build and run the production version of the application.
The build artifacts will be stored in the `dist/` directory.
We use an express server to
* serve static files,
* run the server-side rendering routes of Astro,
* proxy requests to the backend and
* proxy requests to LAPIS.

The proxy is used to avoid CORS issues and to only configure backend URLs for server-side code,
since accessibility might differ for server-side and for client-side code.

#### Configuration

The website is configured via environment variables. They are most conveniently set in the `.env` file.
**Note that Astro requires the environment variables already at build time.**
See `.env.docker` for the required variables.

Furthermore, the website requires config files that need to be present at runtime in the directory
specified in the `CONFIG_DIR` environment variable:
* `config.json`: Contains configuration on the underlying pathogen. It's similar to the database config file that LAPIS uses.
* `reference-genomes.json`: Defines names for segments of the genome and amino acids. It's equal to the file that LAPIS uses.
* `runtime-config.json`: Contains configuration that specific for a deployed instance of the website.

Check our tests and examples for working config files.

## Start from docker-compose

Make sure you are authenticated for the private pathoplexus docker registry (see [here](../README.md) for a step-by-step guide).

We have a [docker-compose config](../docker-compose.yml) to start the website. For flexibility the docker image name is read from the environment.
To use the `:latest` image, you can just run (from the repository root):

```bash
BACKEND_IMAGE=doesNotMatterHere WEBSITE_IMAGE=ghcr.io/pathoplexus/website:latest docker compose up website
```

To pull the latest version of the image, run:

```bash
docker pull ghcr.io/pathoplexus/website:latest
```

## Development environment

### Editor

- [Astro](https://docs.astro.build/en/editor-setup/)

### Setup

- Install node version from `.nvmrc` with `nvm install`

### General tips

- Available scripts can be browsed in [`package.json`](./package.json) or by running `npm run`
