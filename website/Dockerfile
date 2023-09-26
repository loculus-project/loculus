FROM node:lts-alpine as build-deps
WORKDIR /app

COPY .env.docker .env
COPY package*.json ./

RUN npm ci
COPY . .
RUN npm run build

FROM node:lts-alpine

WORKDIR /app

COPY .env.docker .env
COPY entry.js package*.json ./
RUN npm ci --omit=dev

COPY --from=build-deps /app/dist ./dist

CMD node ./entry.js

EXPOSE 3000
VOLUME /config
VOLUME /log
