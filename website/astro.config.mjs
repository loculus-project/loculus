import { defineConfig } from 'astro/config';
import node from '@astrojs/node';
import tailwindcss from '@tailwindcss/vite';
import Icons from 'unplugin-icons/vite';
import react from '@astrojs/react';
import mdx from '@astrojs/mdx';
import flowbiteReact from 'flowbite-react/plugin/astro';

// https://astro.build/config
export default defineConfig({
    output: 'server',
    integrations: [react(), mdx(), flowbiteReact()],
    security: {
        // Allow any forwarded host/proto (required for ingress-terminated deployments with dynamic hostnames).
        // This intentionally disables Astro's host allowlist hardening; rely on network-level controls (ClusterIP + ingress).
        // See https://docs.astro.build/en/reference/configuration-reference/#security and https://github.com/withastro/astro/issues/15713
        allowedDomains: [{}],
    },
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
        ssr: { noExternal: ['cookie'] },
        plugins: [tailwindcss(), Icons({ compiler: 'jsx', jsx: 'react' })],
    },
});
