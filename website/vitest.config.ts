import react from '@vitejs/plugin-react';
import Icons from 'unplugin-icons/vite';
import { defineConfig as defineViteConfig, mergeConfig } from 'vite';
import { defineConfig as defineVitestConfig } from 'vitest/config';

const viteConfig = defineViteConfig({
    plugins: [react(), Icons({ compiler: 'jsx', jsx: 'react' })],
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
