import { glob } from 'astro/loaders';
import { defineCollection, z } from 'astro:content';

const docsSchema = z.object({
    title: z.string(),
    order: z.number().optional(),
    menuTitle: z.string().optional(),
});

const docs = defineCollection({
    loader: glob({ pattern: '**/*.mdx', base: './src/content/docs' }),
    schema: docsSchema,
});

const about = defineCollection({
    loader: glob({ pattern: '**/*.mdx', base: './src/content/about' }),
    schema: docsSchema,
});

export type DocsFrontmatter = z.infer<typeof docsSchema>;

export const collections = { docs, about };
