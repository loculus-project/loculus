ARG NODE_VERSION=22
FROM node:${NODE_VERSION}-alpine as base

WORKDIR /app

COPY .env.docker .env
COPY package.json package-lock.json ./

FROM base as prod-deps
RUN npm install --omit=dev

FROM base as build-deps
RUN npm install

FROM build-deps as build
COPY . .
RUN npm run build

