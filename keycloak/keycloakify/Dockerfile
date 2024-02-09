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
RUN ls -l /output
CMD sh -c 'cp /output/*.jar /destination/'


