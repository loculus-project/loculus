import { defineConfig } from 'astro/config';
import preact from '@astrojs/preact';
import node from '@astrojs/node';

import tailwind from '@astrojs/tailwind';

// https://astro.build/config
export default defineConfig({
  output: 'server',
  integrations: [preact(), tailwind()],
  adapter: node({
    mode: 'standalone',
  }),
});
