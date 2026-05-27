import { defineConfig } from 'astro/config';
import node from '@astrojs/node';
import tailwindcss from '@tailwindcss/vite';
import flowbiteReact from 'flowbite-react/plugin/vite';
import Icons from 'unplugin-icons/vite';
import react from '@astrojs/react';
import mdx from '@astrojs/mdx';

const isTypeCheck = process.env.npm_lifecycle_event === 'check-types';
// TODO: Revisit this Flowbite plugin wrapper outside the Codex sandbox.
// The default plugin starts file watchers while Astro syncs/checks content, which
// currently trips sandbox/file-watch limits. This may not be necessary in normal
// local or CI environments.
const flowbiteReactBuild = () => ({ ...flowbiteReact(), apply: 'build' });
const vitePlugins = [
    tailwindcss(),
    ...(!isTypeCheck ? [flowbiteReactBuild()] : []),
    Icons({ compiler: 'jsx', jsx: 'react' }),
];

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
        plugins: vitePlugins,
    },
});
