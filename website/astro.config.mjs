import { defineConfig } from 'astro/config';
import node from '@astrojs/node';
import tailwindcss from '@tailwindcss/vite';
import Icons from 'unplugin-icons/vite';
import react from '@astrojs/react';
import mdx from '@astrojs/mdx';

// https://astro.build/config
export default defineConfig({
    output: 'server',
    integrations: [react(), mdx()],
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
        plugins: [tailwindcss(), Icons({ compiler: 'jsx', jsx: 'react' })],
    },
});
