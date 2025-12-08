import type { DocsFrontmatter } from '../content.config';

/** Page shape used by DocsMenu, adapted from content collections */
export interface MdxPage {
    url: string;
    file: string;
    frontmatter: DocsFrontmatter;
}
