ARG NODE_VERSION=22
FROM node:${NODE_VERSION}-bookworm AS builder

ARG KEYCLOAK_ORCID_VERSION=1.3.0

USER root

RUN apt-get update && apt-get install -y maven

RUN mvn --version

WORKDIR /app
RUN wget  https://github.com/eosc-kc/keycloak-orcid/releases/download/${KEYCLOAK_ORCID_VERSION}/keycloak-orcid-${KEYCLOAK_ORCID_VERSION}.jar
COPY package.json yarn.lock .yarnrc.yml ./
RUN corepack enable
RUN corepack install
RUN yarn install --immutable && \
    yarn cache clean
COPY . .
RUN yarn build-keycloak-theme

RUN mv dist_keycloak/loculus-theme.jar loculus-theme.jar;

FROM alpine:3.20
RUN mkdir /output
COPY --from=builder /app/keycloak-orcid*.jar /output/
COPY --from=builder /app/loculus-theme.jar /output/
RUN ls -alht /output
CMD sh -c 'cp /output/*.jar /destination/'