import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it, vi } from 'vitest';

import { InnerSequencesContainer } from './SequencesContainer';
import { testConfig, testServer } from '../../../../vitest.setup';
import { toReferenceGenomes } from '../../../utils/sequenceTypeHelpers';

// eslint-disable-next-line @typescript-eslint/naming-convention -- React component test double
vi.mock('./SequenceViewer.tsx', () => ({ SequencesViewer: () => <p>Sequence text</p> }));
const props = {
    organism: 'synthetic',
    accessionVersion: 'TEST1.1',
    clientConfig: testConfig.public,
    loadSequencesAutomatically: true,
    referenceGenomesInfo: toReferenceGenomes(
        ['first', 'second'].map((name) => ({ name, references: [{ name: 'ref', sequence: 'ACGT' }] })),
    ),
};

describe('genome viewer tab', () => {
    it('switches between sequence text and the lazy genome viewer', async () => {
        testServer.use(http.get('http://localhost:3000/seq/TEST1.1/genome', () => HttpResponse.html('<html></html>')));
        const user = userEvent.setup();
        const { container } = render(<InnerSequencesContainer {...props} enableGenomePreview />);
        expect(container.querySelector('iframe')).toBeNull();
        await user.click(screen.getByRole('tab', { name: 'Genome viewer' }));
        expect(screen.queryByText('Sequence text')).toBeNull();
        expect(screen.getByTitle('Genome viewer for TEST1.1, first')).toHaveAttribute(
            'src',
            '/seq/TEST1.1/genome?segment=first',
        );
        await user.selectOptions(screen.getByRole('combobox'), 'second');
        expect(screen.getByTitle('Genome viewer for TEST1.1, second')).toHaveAttribute(
            'src',
            '/seq/TEST1.1/genome?segment=second',
        );
        await user.click(screen.getByRole('tab', { name: 'Nucleotide sequences' }));
        expect(screen.getByText('Sequence text')).toBeVisible();
        expect(container.querySelector('iframe')).toBeNull();
    });
    it('keeps the existing tabs when the preview is disabled', () => {
        render(<InnerSequencesContainer {...props} />);
        expect(screen.queryByRole('tab', { name: 'Genome viewer' })).toBeNull();
    });
});
