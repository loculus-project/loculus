FROM node:lts-alpine as build-deps
WORKDIR /app

COPY .env.docker .env
COPY package*.json ./

RUN npm ci
COPY . .
RUN npm run build

FROM node:lts-alpine
COPY --from=build-deps /app/dist ./dist
COPY --from=build-deps /app/package*.json ./
RUN npm ci --omit=dev

COPY .env.docker .env
ENV PORT=3000
EXPOSE 3000
CMD node ./dist/server/entry.mjs &> /log/website.log


VOLUME /config
VOLUME /log