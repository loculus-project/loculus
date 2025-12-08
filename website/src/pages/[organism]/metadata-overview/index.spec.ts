import type { APIContext } from 'astro';
import { expect, test, describe, vi } from 'vitest';

import { GET } from './index';

vi.mock('../../../config.ts', () => ({
    getSchema: (organismKey: string) => {
        if (organismKey === 'test-organism') {
            return {
                inputFields: [
                    {
                        name: 'sampleLocation',
                        required: true,
                        definition: 'Location where sample was collected',
                        guidance: 'Use ISO country codes',
                        example: 'USA',
                    },
                    {
                        name: 'collectionDate',
                        required: false,
                        definition: 'Date of sample collection',
                        example: '2024-01-15',
                    },
                    {
                        name: 'optionalField',
                        required: false,
                    },
                ],
            };
        }
        throw new Error(`Unknown organism: ${organismKey}`);
    },
    getSubmissionIdInputFields: () => [
        {
            name: 'submissionId',
            required: true,
            definition: 'Unique identifier for submission',
            example: 'SUB123',
        },
    ],
}));

vi.mock('../../../components/Navigation/cleanOrganism.ts', () => ({
    cleanOrganism: (rawOrganism: string) => {
        if (rawOrganism === 'test-organism') {
            return {
                organism: {
                    key: 'test-organism',
                    displayName: 'Test Organism',
                },
            };
        }
        return { organism: undefined };
    },
}));

describe('metadata-overview API route', () => {
    test('should return 404 for invalid organism', () => {
        const response = GET({
            params: { organism: 'invalid-organism' },
        } as unknown as APIContext) as Response;

        expect(response.status).toBe(404);
    });

    test('should return TSV with correct headers and content', async () => {
        const response = GET({
            params: { organism: 'test-organism' },
        } as unknown as APIContext) as Response;

        expect(response.status).toBe(200);
        expect(response.headers.get('Content-Type')).toBe('text/tsv');
        expect(response.headers.get('Content-Disposition')).toBe(
            'attachment; filename="Test_Organism_metadata_overview.tsv"',
        );

        const text = await response.text();
        const lines = text.split('\n');

        // Check header row
        expect(lines[0]).toBe('Field Name\tRequired\tDefinition\tExample');

        // Check submission ID field
        expect(lines[1]).toBe('submissionId\tYes\tUnique identifier for submission\tSUB123');

        // Check first input field with all properties
        expect(lines[2]).toBe('sampleLocation\tYes\tLocation where sample was collected Use ISO country codes\tUSA');

        // Check field with no guidance
        expect(lines[3]).toBe('collectionDate\tNo\tDate of sample collection\t2024-01-15');

        // Check field with minimal properties
        expect(lines[4]).toBe('optionalField\tNo\t\t');
    });

    test('should replace spaces with underscores in filename', () => {
        const response = GET({
            params: { organism: 'test-organism' },
        } as unknown as APIContext) as Response;

        const contentDisposition = response.headers.get('Content-Disposition');
        expect(contentDisposition).toContain('Test_Organism');
        expect(contentDisposition).not.toContain('Test Organism');
    });

    test('should handle fields without definition or example', async () => {
        const response = GET({
            params: { organism: 'test-organism' },
        } as unknown as APIContext) as Response;

        const text = await response.text();
        const lines = text.split('\n');

        // The optionalField has no definition or example
        expect(lines[4]).toBe('optionalField\tNo\t\t');
    });

    test('should trim definition and guidance combination', async () => {
        const response = GET({
            params: { organism: 'test-organism' },
        } as unknown as APIContext) as Response;

        const text = await response.text();
        const lines = text.split('\n');

        // Check that definition and guidance are combined with space and trimmed
        expect(lines[2]).toContain('Location where sample was collected Use ISO country codes');
    });
});
