import { defineConfig } from 'astro/config';
import node from '@astrojs/node';
import tailwind from '@astrojs/tailwind';
import Icons from 'unplugin-icons/vite';
import react from '@astrojs/react';
import mdx from '@astrojs/mdx';

// https://astro.build/config
export default defineConfig({
    output: 'server',
    integrations: [tailwind(), react(), mdx()],
    adapter: node({
        mode: 'standalone',
    }),
    server: {
        port: 3000,
        host: '0.0.0.0',
    },
    vite: {
        optimizeDeps: {
            exclude: ['fsevents', 'msw/node', 'msw', 'chromium-bidi'],
        },
        plugins: [Icons({ compiler: 'jsx', jsx: 'react' })],
    },
});
