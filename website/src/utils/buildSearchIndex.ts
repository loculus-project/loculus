import type MiniSearch from 'minisearch';
import { parse as parseYaml } from 'yaml';

interface SearchDocument {
    id: string;
    title: string;
    section: 'docs' | 'about';
    url: string;
    content: string;
}

interface SearchIndexPayload {
    options: ConstructorParameters<typeof MiniSearch>[0];
    documents: SearchDocument[];
}

const docsRaw = import.meta.glob<string>('../pages/docs/**/*.mdx', {
    eager: true,
    query: '?raw',
    import: 'default',
});
const aboutRaw = import.meta.glob<string>('../pages/about/**/*.mdx', {
    eager: true,
    query: '?raw',
    import: 'default',
});

const FRONTMATTER_RE = /^---\n([\s\S]*?)\n---\n?/;

const splitFrontmatter = (content: string): { frontmatter: Record<string, unknown>; body: string } => {
    const match = FRONTMATTER_RE.exec(content);
    if (!match) return { frontmatter: {}, body: content };
    let parsed: unknown = {};
    try {
        parsed = parseYaml(match[1]) ?? {};
    } catch {
        parsed = {};
    }
    const frontmatter = (typeof parsed === 'object' && parsed !== null ? parsed : {}) as Record<string, unknown>;
    return { frontmatter, body: content.slice(match[0].length) };
};

const stripMarkdown = (body: string): string =>
    body
        .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
        .replace(/^#{1,6}\s+/gm, '')
        .replace(/```[\s\S]*?```/g, '')
        .replace(/`([^`]+)`/g, '$1')
        .replace(/<!--[\s\S]*?-->/g, '')
        .replace(/\s+/g, ' ')
        .trim();

const pathToUrl = (modulePath: string): string => {
    // ../pages/docs/how-to/revise-submissions.mdx -> /docs/how-to/revise-submissions
    // ../pages/docs/how-to/index.mdx              -> /docs/how-to
    const fromPages = modulePath.split('/pages/')[1];
    return '/' + fromPages.replace(/\.mdx$/, '').replace(/\/index$/, '');
};

const buildDocuments = (modules: Record<string, string>, section: 'docs' | 'about'): SearchDocument[] => {
    return Object.entries(modules).map(([modulePath, raw], i) => {
        const { frontmatter, body } = splitFrontmatter(raw);
        const title =
            typeof frontmatter.title === 'string' && frontmatter.title.length > 0 ? frontmatter.title : 'Untitled';
        return {
            id: `${section}-${i}`,
            title,
            section,
            url: pathToUrl(modulePath),
            content: stripMarkdown(body),
        };
    });
};

const payload: SearchIndexPayload = {
    options: {
        fields: ['title', 'content'],
        storeFields: ['title', 'url', 'section'],
    },
    documents: [...buildDocuments(docsRaw, 'docs'), ...buildDocuments(aboutRaw, 'about')],
};

export const searchIndexJson: string = JSON.stringify(payload);
