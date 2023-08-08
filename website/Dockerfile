FROM node:lts AS runtime
WORKDIR /app

COPY package.json .
COPY package-lock.json .
RUN npm --quiet ci

COPY . .
RUN npm run build

ENV HOST=0.0.0.0
ENV PORT=3000
ENV CONFIG_DIR=/config
VOLUME /config
EXPOSE 3000

CMD node ./dist/server/entry.mjs