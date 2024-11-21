# Keycloakify theme

This is a keycloak theme, built with keycloakify, and branched from <https://github.com/keycloakify/keycloakify-starter>.

We last synced with upstream on 2024-05-11.

To preview in the storybook:

```bash
nvm use # use the correct node version
yarn install --immutable # install dependencies (it's like npm install)
yarn storybook
```

To build a JAR and package it into an image that copies it to an output directory, build the Dockerfile. (This is done by CI).

Currently, only the login theme is implemented.

## Dependency documentation

### Keycloakify

https://docs.keycloakify.dev/

### Keycloak ORCID

https://github.com/eosc-kc/keycloak-orcid

## Installing yarn 4

Prerequisite: node

```bash
corepack enable
corepack install yarn
```
