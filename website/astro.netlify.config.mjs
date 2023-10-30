import { defineConfig } from 'astro/config';
import netlify from '@astrojs/netlify/functions';
import tailwind from '@astrojs/tailwind';
import Icons from 'unplugin-icons/vite';
import react from '@astrojs/react';

// https://astro.build/config
export default defineConfig({
    output: 'server',
    integrations: [tailwind(), react()],
    adapter: netlify(),
    vite: {
        optimizeDeps: {
            exclude: ['fsevents'],
        },
        plugins: [
            Icons({ compiler: 'jsx', jsx: 'react' }),
          ],
        
    }
});
