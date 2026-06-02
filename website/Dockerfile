ARG NODE_VERSION=22
FROM node:${NODE_VERSION}-alpine AS base

# Layout: the website tree lives at /build/website, the canonical-config-tools
# tree at /build/config-tools (sibling). The latter is brought in via a named
# build context (`--build-context config-tools=./config-tools`) so the
# `../../../config-tools/...` relative imports in src/types/loculusConfig.ts
# resolve at build time. CI passes the build context via build-push-action's
# `build-contexts:` input; locally the build-local-images.sh script does
# the same.
WORKDIR /build/website

COPY .env.docker .env
COPY package.json package-lock.json ./

FROM base AS prod-deps
RUN npm ci --omit=dev

FROM base AS build-deps
RUN npm ci

FROM build-deps AS build
COPY . .
COPY --from=config-tools . /build/config-tools/
RUN ln -s /build/website/node_modules /build/node_modules
RUN npm run build

FROM base AS runtime
COPY --from=prod-deps /build/website/node_modules ./node_modules
COPY --from=build /build/website/dist ./dist

EXPOSE 3000
VOLUME /config
VOLUME /log

CMD ["node", "--max-old-space-size=1024", "./dist/server/entry.mjs"]
