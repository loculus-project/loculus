import { defineConfig } from 'astro/config';
import node from '@astrojs/node';
import tailwind from '@astrojs/tailwind';
import Icons from 'unplugin-icons/vite'

import react from '@astrojs/react';

// https://astro.build/config
export default defineConfig({
    output: 'server',
    integrations: [tailwind(), react()],
    adapter: node({
        mode: 'middleware',
    }),
    server: {
        port: 3000,
        host: '0.0.0.0',
    },
    vite: {
        optimizeDeps: {
            exclude: ['fsevents'],
        },
        plugins: [
            Icons({ compiler: 'jsx', jsx: 'react' }),
          ],
    },
});
