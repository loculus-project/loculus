FROM node:lts AS runtime
WORKDIR /app

COPY .env.docker .env

COPY package.json package-lock.json ./

RUN npm --quiet ci

COPY . .

RUN npm run build

ENV PORT=3000
VOLUME /config
VOLUME /log
EXPOSE 3000

CMD node ./dist/server/entry.mjs  > /log/website.log 2> /log/website_error.log