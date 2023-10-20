import { defineConfig } from 'astro/config';
import node from '@astrojs/node';
import tailwind from '@astrojs/tailwind';

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
    
    },
});
