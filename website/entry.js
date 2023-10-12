import express from 'express';
import { handler as ssrHandler } from './dist/server/entry.mjs';
import { createProxyMiddleware } from 'http-proxy-middleware';
import path from 'path';
import fs from 'fs';
import 'dotenv/config';
import winston from 'winston';

const configDir = process.env.CONFIG_DIR;
const logDir = process.env.LOG_DIR;

if (logDir === undefined) {
    console.log('No logger configured. Set environment variable LOG_DIR to enable logging.');
}

function logProvider() {
    if (logDir === undefined) {
        return {
            log: () => {},
            debug: () => {},
            info: () => {},
            warn: () => {},
            error: () => {},
        };
    }
    return winston.createLogger({
        level: 'info',
        format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
        transports: new winston.transports.File({ filename: `${logDir}/website.log` }),
    });
}

if (typeof configDir !== 'string' || configDir === '') {
    throw new Error('CONFIG_DIR environment variable is not set');
}
const configFilePath = path.join(configDir, 'runtime_config.json');
const serviceConfig = JSON.parse(fs.readFileSync(configFilePath, 'utf8'));

const backendProxy = createProxyMiddleware('/backendProxy/**', {
    target: serviceConfig.backendUrl,
    changeOrigin: true,
    pathRewrite: {
        '^/backendProxy/': '/',
    },
    logProvider,
});

const lapisProxy = createProxyMiddleware('/lapisProxy/**', {
    target: serviceConfig.lapisUrl,
    changeOrigin: true,
    pathRewrite: {
        '^/lapisProxy/': '/',
    },
    logProvider,
});

const app = express();

const base = '/';

const logger = logProvider();
if (logger !== undefined) {
    app.use((req, res, next) => {
        if (req.url.startsWith('/_astro/')) {
            logger.debug(`Request: ${req.url}`);
        } else {
            logger.info(`Request: ${req.url}`);
        }
        next();
    });
}

app.use(ssrHandler);
app.use(base, express.static('dist/client/'), backendProxy, lapisProxy);

app.listen(3000);
