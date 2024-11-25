ARG NODE_VERSION=22
FROM node:${NODE_VERSION}-alpine AS base

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

FROM base AS runtime
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist

EXPOSE 3000
VOLUME /config
VOLUME /log

CMD ["node", "--max-old-space-size=1024", "./dist/server/entry.mjs"]
