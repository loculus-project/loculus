FROM node:lts-alpine as build-deps
WORKDIR /app

COPY .env.docker .env
COPY package*.json ./

RUN npm ci
COPY . .
RUN npm run build

FROM node:lts-alpine

WORKDIR /app

EXPOSE 3000
VOLUME /config
VOLUME /log

COPY .env.docker .env
COPY package*.json ./
COPY --from=build-deps /app/dist ./dist

RUN npm ci --omit=dev

CMD node ./dist/server/entry.mjs &> /log/website.log
