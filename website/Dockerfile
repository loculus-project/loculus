FROM node:lts-alpine as base
WORKDIR /app

COPY package.json package-lock.json ./

FROM base as prod-deps
RUN npm install --production

FROM base as build-deps
RUN npm install --production=false

FROM build-deps as build
COPY . .
RUN npm run build

FROM base AS runtime
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist

EXPOSE 3000
VOLUME /config
VOLUME /log

CMD node ./dist/server/entry.mjs
