import express from 'express';
import { handler as ssrHandler } from './dist/server/entry.mjs';
import { createProxyMiddleware } from 'http-proxy-middleware';
import path from 'path';
import fs from 'fs';
import 'dotenv/config';

const configDir = process.env.CONFIG_DIR;

if (typeof configDir !== 'string' || configDir === '') {
    throw new Error('CONFIG_DIR environment variable is not set');
}
const configFilePath = path.join(configDir, 'runtime-config.json');
const serviceConfig = JSON.parse(fs.readFileSync(configFilePath, 'utf8'));

const backendProxy = createProxyMiddleware('/backendProxy/**', {
    target: serviceConfig.backendUrl,
    changeOrigin: true,
    pathRewrite: {
        '^/backendProxy/': '/',
    },
});

const lapisProxy = createProxyMiddleware('/lapisProxy/**', {
    target: serviceConfig.lapisUrl,
    changeOrigin: true,
    pathRewrite: {
        '^/lapisProxy/': '/',
    },
});

const app = express();

const base = '/';
app.use(ssrHandler);
app.use(base, express.static('dist/client/'), backendProxy, lapisProxy);

app.listen(3000);
