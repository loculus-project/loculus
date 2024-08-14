import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import tailwind from '@astrojs/tailwind';

// https://astro.build/config
export default defineConfig({
    base: '/loculus/',
    integrations: [
        starlight({
            title: 'Loculus',
            editLink: {
                baseUrl: 'https://github.com/loculus-project/loculus/edit/main/docs/',
            },
            customCss: ['./src/styles/tailwind.css', './src/styles/custom.css'],
            social: {
                github: 'https://github.com/loculus-project/loculus',
            },
            sidebar: [
                {
                    label: 'Introduction',
                    items: [
                        { label: 'What is Loculus?', link: '/introduction/what-is-loculus/' },
                        { label: 'Current state and roadmap', link: '/introduction/current-state-and-roadmap/' },
                        { label: 'Glossary', link: '/introduction/glossary/' },
                        { label: 'System overview', link: '/introduction/system-overview/' },
                    ],
                },
                {
                    label: 'For administrators',
                    items: [
                        { label: 'Getting started', link: '/for-administrators/getting-started/' },
                        { label: 'Setup with Kubernetes', link: '/for-administrators/setup-with-kubernetes/' },
                        { label: 'User administration', link: '/for-administrators/user-administration/' },
                    ],
                },
                {
                    label: 'Reference',
                    autogenerate: { directory: 'reference' },
                },
            ],
        }),
        tailwind({
            applyBaseStyles: false,
        }),
    ],
});
