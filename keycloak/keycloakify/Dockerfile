FROM node:latest as builder

USER root
RUN apt-get update && apt-get install -y maven

WORKDIR /app
COPY package.json yarn.lock ./
RUN yarn
COPY . .
RUN yarn build-keycloak-theme

FROM alpine:latest
RUN mkdir /output
COPY --from=builder /app/build_keycloak/target/*.jar /output/
RUN apk add --no-cache wget
RUN wget -P /output https://github.com/eosc-kc/keycloak-orcid/releases/download/1.2.0/keycloak-orcid-1.2.0.jar
RUN ls -l /output
CMD sh -c 'cp /output/*.jar /destination/'