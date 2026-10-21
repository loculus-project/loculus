ARG NODE_VERSION=22
FROM node:${NODE_VERSION}-alpine
WORKDIR /app

COPY package*.json ./

RUN npm ci

COPY . .

RUN npm run build
RUN npm install -g http-server

EXPOSE 8080

CMD ["http-server", "dist", "-p", "8080"]
