FROM node:22-bookworm as builder

USER root
RUN apt-get update && apt-get install -y maven

RUN mvn --version

RUN yarn versions

WORKDIR /app
RUN wget  https://github.com/eosc-kc/keycloak-orcid/releases/download/1.3.0/keycloak-orcid-1.3.0.jar
COPY package.json yarn.lock ./
RUN yarn install --frozen-lockfile
COPY . .
RUN yarn build-keycloak-theme

FROM alpine:3.19
RUN mkdir /output
COPY --from=builder /app/keycloak-orcid*.jar /output/
# /loculus.jar is the theme name set in vite.config.ts
COPY --from=builder /app/dist_keycloak/target/loculus*.jar /output/
RUN ls -alht /output
CMD sh -c 'cp /output/*.jar /destination/'