ARG NODE_VERSION=22
FROM node:${NODE_VERSION}-bookworm as builder

ARG KEYCLOAK_ORCID_VERSION=1.3.0

USER root

RUN apt-get update && apt-get install -y maven

RUN mvn --version

WORKDIR /app
RUN wget  https://github.com/eosc-kc/keycloak-orcid/releases/download/${KEYCLOAK_ORCID_VERSION}/keycloak-orcid-${KEYCLOAK_ORCID_VERSION}.jar
COPY package.json yarn.lock .yarnrc.yml ./
COPY .yarn/releases .yarn/releases
RUN corepack enable
RUN corepack install
RUN yarn install --immutable && \
    yarn cache clean
COPY . .
RUN yarn build-keycloak-theme

FROM alpine:3.19
RUN mkdir /output
COPY --from=builder /app/keycloak-orcid*.jar /output/
# /loculus.jar is the theme name set in vite.config.ts
COPY --from=builder /app/dist_keycloak/target/loculus*.jar /output/
RUN ls -alht /output
CMD sh -c 'cp /output/*.jar /destination/'