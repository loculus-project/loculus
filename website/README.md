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
To run e2e-tests first start the local test server with `npm run start-test-server` and then run `npm run e2e` to execute the end-to-end tests.

If you run Playwright for the first time, you might need to run `npx playwright install`
and `npx playwright install-deps` first. Playwright will tell you if that's the case.

## Start from docker-compose

Make sure you are authenticated for the private pathoplexus docker registry (see [here](../README.md) for a step-by-step guide).

We have a [docker-compose config](./docker-compose.yml) to start the website. For flexibility the docker image name is read from the environment. To use the `:latest` image, you can just run:

```bash
DOCKER_IMAGE_NAME=ghcr.io/pathoplexus/website:latest docker compose up
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
