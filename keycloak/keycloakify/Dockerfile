ARG NODE_VERSION=22
FROM node:${NODE_VERSION}-bookworm AS builder

ARG KEYCLOAK_ORCID_VERSION=1.3.0
ARG KEYCLOAK_MAJOR_VERSION=26

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
# You can set an explicit version in vite.config.ts, see docs here:
# https://docs.keycloakify.dev/targeting-specific-keycloak-versions
# But for now this was the easiest way; In the future once we migrated away from KC<25 we can just get rid if this entirely

FROM alpine:3.19
RUN mkdir /output
COPY --from=builder /app/keycloak-orcid*.jar /output/
COPY --from=builder /app/loculus-theme.jar /output/
RUN ls -alht /output
CMD sh -c 'cp /output/*.jar /destination/'