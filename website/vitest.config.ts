import { fileURLToPath } from 'node:url';

import react from '@vitejs/plugin-react';
import Icons from 'unplugin-icons/vite';
import { defineConfig as defineViteConfig, mergeConfig } from 'vite';
import { defineConfig as defineVitestConfig } from 'vitest/config';

const astroEnvServerModule = 'astro:env/server';

const viteConfig = defineViteConfig({
    plugins: [react(), Icons({ compiler: 'jsx', jsx: 'react' })],
    resolve: {
        alias: {
            [astroEnvServerModule]: fileURLToPath(new URL('./vitest.env.ts', import.meta.url)),
        },
    },
});

const vitestConfig = defineVitestConfig({
    test: {
        globals: true,
        environment: 'happy-dom',
        setupFiles: ['./vitest.setup.ts'],
        include: ['./src/**/*.spec.ts', './src/**/*.spec.tsx'],
    },
});

export default mergeConfig(viteConfig, vitestConfig);
