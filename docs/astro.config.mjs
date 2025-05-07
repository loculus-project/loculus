import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import tailwind from '@astrojs/tailwind';

// https://astro.build/config
export default defineConfig({
    integrations: [
        starlight({
            title: 'Loculus',
            head: [
                {
                    tag: 'meta',
                    attrs: {
                        property: 'og:image',
                        content: 'https://loculus.org/images/og-image.png',
                    },
                },
                {
                    tag: 'script',
                    attrs: {
                        'defer': true,
                        'data-domain': 'loculus.org',
                        'src': 'https://plausible.io/js/script.js',
                    },
                },
            ],
            editLink: {
                baseUrl: 'https://github.com/loculus-project/loculus/edit/main/docs/',
            },
            customCss: ['./src/styles/tailwind.css', './src/styles/custom.css'],
            social: [{ icon: 'github', label: 'Github', href: 'https://github.com/loculus-project/loculus' }],
            sidebar: [
                {
                    label: 'Introduction',
                    items: [
                        { label: 'What is Loculus?', link: '/introduction/what-is-loculus/' },
                        { label: 'Current state and roadmap', link: '/introduction/current-state-and-roadmap/' },
                        { label: 'Glossary', link: '/introduction/glossary/' },
                        { label: 'System overview', link: '/introduction/system-overview/' },
                        { label: 'API overview', link: '/introduction/api-overview/' },
                    ],
                },
                {
                    label: 'For users',
                    items: [
                        { label: 'Introduction', link: '/for-users/introduction/' },
                        { label: 'Search sequences', link: '/for-users/search-sequences/' },
                        { label: 'Edit account', link: '/for-users/edit-account/' },
                        { label: 'Create and manage groups', link: '/for-users/create-manage-groups/' },
                        { label: 'Submit sequences', link: '/for-users/submit-sequences/' },
                        { label: 'Revise sequences', link: '/for-users/revise-sequences/' },
                        { label: 'Revoke sequences', link: '/for-users/revoke-sequences/' },
                        { label: 'Approve submissions', link: '/for-users/approve-submissions/' },
                        { label: 'Edit submissions', link: '/for-users/edit-submissions/' },
                        { label: 'Authenticate via API', link: '/for-users/authenticate-via-api/' },
                    ],
                },
                {
                    label: 'For administrators',
                    items: [
                        { label: 'Getting started', link: '/for-administrators/getting-started/' },
                        { label: 'My first Loculus', link: '/for-administrators/my-first-loculus/' },
                        { label: 'Setup with k3d and nginx', link: '/for-administrators/setup-with-k3d-and-nginx/' },
                        { label: 'Setup with Kubernetes', link: '/for-administrators/setup-with-kubernetes/' },
                        { label: 'Schema designs', link: '/for-administrators/schema-designs/' },
                        {
                            label: 'Preprocessing pipelines',
                            items: [
                                'for-administrators/pipeline-concept',
                                'for-administrators/existing-preprocessing-pipelines',
                                'for-administrators/build-new-preprocessing-pipeline',
                            ],
                        },
                        { label: 'Data use terms', link: '/for-administrators/data-use-terms/' },
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
