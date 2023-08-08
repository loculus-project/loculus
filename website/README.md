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
To run e2e-tests first start the local test server with `npm run start-test-server` and then run `npm run e2e` to execute the end-to-end tests.

If you run Playwright for the first time, you might need to run `npx playwright install`
and `npx playwright install-deps` first. Playwright will tell you if that's the case.

## Start from docker-compose

We have a [docker-compose config](./docker-compose.yml) to start the website. For flexibility the docker image name is read from the environment. To use the `:latest` image, you can just run:

```bash 
DOCKER_IMAGE_NAME=ghcr.io/pathoplexus/website:latest docker compose up
```

To pull the latest version of the image, run:

```bash 
docker pull ghcr.io/pathoplexus/website:latest
```

