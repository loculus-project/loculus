import { describe, expect, it } from 'vitest';

import { organismRolloutSnippet, organismValuesYamlSnippet } from './PublishModal';

describe('organismRolloutSnippet', () => {
    it('renders a helm-style rollout command with the organism key + version', () => {
        const snippet = organismRolloutSnippet('lassa-virus', 4);
        expect(snippet).toContain('helm upgrade');
        expect(snippet).toContain('--set organisms.lassa-virus.configVersion=4');
        expect(snippet).toContain('--reuse-values');
    });

    it('preserves multi-line backslash continuations so the snippet can be pasted as-is', () => {
        const snippet = organismRolloutSnippet('foo', 1);
        const lines = snippet.split('\n');
        expect(lines.length).toBeGreaterThanOrEqual(3);
        // every line except the last ends with a backslash so the shell sees one command
        expect(lines.slice(0, -1).every((l) => l.trimEnd().endsWith('\\'))).toBe(true);
        expect(lines[lines.length - 1].trimEnd().endsWith('\\')).toBe(false);
    });
});

describe('organismValuesYamlSnippet', () => {
    it('renders the exact configVersion value to change in values.yaml', () => {
        const snippet = organismValuesYamlSnippet('lassa-virus', 4);
        expect(snippet).toContain('organisms:');
        expect(snippet).toContain('  lassa-virus:');
        expect(snippet).toContain('    configVersion: 4');
        expect(snippet).toContain('defaultOrganisms');
    });
});
