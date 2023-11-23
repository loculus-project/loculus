import express from 'express';
import { handler as ssrHandler } from './dist/server/entry.mjs';
import { createProxyMiddleware } from 'http-proxy-middleware';
import path from 'path';
import fs from 'fs';
import 'dotenv/config';
import winston from 'winston';

const configDir = process.env.CONFIG_DIR;
const logDir = process.env.LOG_DIR;

function logProvider() {
    const transports = [];

    transports.push(new winston.transports.Console());

    if (logDir !== undefined) {
        transports.push(new winston.transports.File({ filename: `${logDir}/website.log` }));
    }

    return winston.createLogger({
        level: 'info',
        format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
        transports,
    });
}

if (typeof configDir !== 'string' || configDir === '') {
    throw new Error('CONFIG_DIR environment variable is not set');
}
const configFilePath = path.join(configDir, 'runtime_config.json');
let serviceConfigString = fs.readFileSync(configFilePath, 'utf8');
const serviceConfig = JSON.parse(serviceConfigString);

// TODO(#453) reuse the zod type from Astro server code
if (serviceConfig.backendUrl === undefined) {
    throw new Error('Runtime config does not contain backendUrl, was: ' + serviceConfigString);
}
if (serviceConfig.lapisUrls === undefined) {
    throw new Error('Runtime config does not contain lapisUrl, was: ' + serviceConfigString);
}

const backendProxy = createProxyMiddleware('/backendProxy/**', {
    target: serviceConfig.backendUrl,
    changeOrigin: true,
    pathRewrite: {
        '^/backendProxy/': '/',
    },
    logProvider,
});

const lapisProxies = Object.entries(serviceConfig.lapisUrls).map(([organism, url]) =>
    createProxyMiddleware(`/lapisProxy/${organism}/**`, {
        target: url,
        changeOrigin: true,
        pathRewrite: {
            [`/lapisProxy/${organism}/`]: '/',
        },
        logProvider,
    }),
);

const app = express();

const base = '/';

const logger = logProvider();
if (logger !== undefined) {
    app.use((req, _, next) => {
        if (req.url.startsWith('/_astro/')) {
            logger.debug(`Request: ${req.url}`);
        } else {
            logger.info(`Request: ${req.url}`);
        }
        next();
    });
}

app.use(ssrHandler);
app.use(base, express.static('dist/client/'), backendProxy, lapisProxies);

app.listen(3000);
