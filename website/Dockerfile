FROM node:lts-alpine as build-deps
WORKDIR /app

COPY package*.json ./

RUN npm ci
COPY . .
RUN npm run build

FROM node:lts-alpine



WORKDIR /app

COPY entry.js package*.json ./
RUN npm ci --omit=dev

COPY --from=build-deps /app/dist ./dist

ENV CONFIG_DIR=/config
ENV LOG_DIR=/log

CMD node ./entry.js

EXPOSE 3000
VOLUME /config
VOLUME /log