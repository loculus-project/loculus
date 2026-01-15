import type { MDXInstance } from 'astro';

/**
 * Frontmatter properties used by MDX pages.
 * These properties are accessed in components like DocsMenu.
 */
export interface MdxFrontmatter extends Record<string, unknown> {
    title?: string;
    menuTitle?: string;
    order?: number;
}

export type MdxPage = MDXInstance<MdxFrontmatter>;
