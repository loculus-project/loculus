/// <reference types="vitest" />
/// <reference types="vite/client" />

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
    plugins: [react()],
    test: {
        globals: true,
        environment: 'jsdom',
        setupFiles: ['./src/components/vitest.setup.ts'],
        include: ['./src/**/*.spec.ts', './src/**/*.spec.tsx'],
    },
});
