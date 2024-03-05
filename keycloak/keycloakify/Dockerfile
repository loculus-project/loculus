FROM node:21-bookworm as builder

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
RUN wget -P /output https://github.com/eosc-kc/keycloak-orcid/releases/download/1.2.0/keycloak-orcid-1.2.0.jar
RUN ls -l /output
CMD sh -c 'cp /output/*.jar /destination/'