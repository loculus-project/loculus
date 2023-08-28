FROM node:lts AS runtime
WORKDIR /app

COPY .env.example .env

COPY package.json package-lock.json ./

RUN npm --quiet ci

COPY . .

RUN npm run build

ENV PORT=3000
ENV CONFIG_DIR=/config
VOLUME /config
EXPOSE 3000

CMD node ./dist/server/entry.mjs