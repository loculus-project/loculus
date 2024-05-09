ARG NODE_VERSION=22
FROM node:${NODE_VERSION}-alpine as build-deps

WORKDIR /app

COPY .env.docker .env
COPY package*.json ./

RUN npm ci
COPY . .
RUN npm run build

FROM node:${NODE_VERSION}-alpine

WORKDIR /app

COPY .env.docker .env
COPY package*.json ./
RUN npm ci --omit=dev

COPY --from=build-deps /app/dist ./dist

CMD node ./dist/server/entry.mjs

EXPOSE 3000
VOLUME /config
VOLUME /log
