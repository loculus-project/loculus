import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { OrganismMetadataTable } from './OrganismMetadataTable';
import type { OrganismMetadata } from './OrganismMetadataTableSelector';

const makeOrganism = (fields: OrganismMetadata['groupedInputFields']): OrganismMetadata => ({
    key: 'test-org',
    displayName: 'Test Organism',
    metadata: [],
    groupedInputFields: fields,
});

describe('OrganismMetadataTable', () => {
    it('renders backtick-quoted text as code elements, not literal backticks', () => {
        const organism = makeOrganism(
            new Map([
                [
                    'Required fields',
                    [
                        {
                            name: 'id',
                            displayName: 'ID',
                            definition: 'METADATA ID',
                            guidance: 'If no `fastaIds` column is provided, this ID is used.',
                            example: 'GJP123',
                            required: true,
                        },
                    ],
                ],
            ]),
        );

        render(<OrganismMetadataTable organism={organism} />);

        const codeElement = screen.getByText('fastaIds');
        expect(codeElement.tagName).toBe('CODE');

        // Backticks should not appear in the rendered text
        const descriptionCell = codeElement.closest('td');
        expect(descriptionCell?.textContent).not.toContain('`');
        expect(descriptionCell?.textContent).toContain('fastaIds');
    });

    it('renders plain description text without code elements', () => {
        const organism = makeOrganism(
            new Map([
                [
                    'Required fields',
                    [
                        {
                            name: 'country',
                            displayName: 'Country',
                            definition: 'Collection country',
                            guidance: 'Enter the country name.',
                            example: 'Germany',
                            required: true,
                        },
                    ],
                ],
            ]),
        );

        render(<OrganismMetadataTable organism={organism} />);

        const row = screen.getByText('country').closest('tr')!;
        const descriptionCell = row.querySelectorAll('td')[2];
        expect(descriptionCell.querySelector('code')).toBeNull();
        expect(descriptionCell.textContent).toBe('Collection country Enter the country name.');
    });
});
