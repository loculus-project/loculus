ARG NODE_VERSION=22
FROM node:${NODE_VERSION}-bookworm AS builder

ARG KEYCLOAK_ORCID_VERSION=1.3.0
ARG KEYCLOAK_MAJOR_VERSION=24

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

RUN if [ "$KEYCLOAK_MAJOR_VERSION" -le 25 ]; then \
        mv dist_keycloak/keycloak-theme-for-kc-22-to-25.jar loculus-theme.jar; \
    else \
        mv dist_keycloak/keycloak-theme-for-kc-all-other-versions.jar loculus-theme.jar; \
    fi

FROM alpine:3.19
RUN mkdir /output
COPY --from=builder /app/keycloak-orcid*.jar /output/
COPY --from=builder /app/loculus-theme.jar /output/
RUN ls -alht /output
CMD sh -c 'cp /output/*.jar /destination/'