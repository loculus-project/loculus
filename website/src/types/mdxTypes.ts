import type { MDXInstance } from 'astro';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(#3451) use content collections for proper types
export type MdxPage = MDXInstance<Record<string, any>>;
