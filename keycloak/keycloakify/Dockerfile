ARG KEYCLOAK_ORCID_VERSION=1.3.0
ARG NODE_VERSION=22
FROM node:${NODE_VERSION}-bookworm as builder

USER root
RUN apt-get update && apt-get install -y maven

RUN mvn --version

RUN yarn versions

WORKDIR /app
COPY package.json yarn.lock ./
RUN yarn install --frozen-lockfile
COPY . .
RUN yarn build-keycloak-theme

FROM alpine:3.19
RUN mkdir /output
COPY --from=builder /app/build_keycloak/target/*.jar /output/
RUN apk add --no-cache wget curl
RUN wget -P /output https://github.com/eosc-kc/keycloak-orcid/releases/download/${NODE_VERSION}/keycloak-orcid-${NODE_VERSION}.jar
RUN ls -l /output
CMD sh -c 'cp /output/*.jar /destination/'