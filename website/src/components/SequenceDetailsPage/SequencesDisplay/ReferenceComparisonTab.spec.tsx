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

describe('reference comparison tab', () => {
    it('switches between sequence text and the lazy reference comparison', async () => {
        testServer.use(
            http.get('http://localhost:3000/seq/TEST1.1/reference-comparison', () =>
                HttpResponse.html('<html></html>'),
            ),
        );
        const user = userEvent.setup();
        const { container } = render(<InnerSequencesContainer {...props} />);
        expect(container.querySelector('iframe')).toBeNull();
        await user.click(screen.getByRole('tab', { name: 'Reference comparison' }));
        expect(screen.queryByText('Sequence text')).toBeNull();
        expect(screen.getByTitle('Reference Comparison for TEST1.1, first')).toHaveAttribute(
            'src',
            '/seq/TEST1.1/reference-comparison?segment=first',
        );
        await user.selectOptions(screen.getByRole('combobox'), 'second');
        expect(screen.getByTitle('Reference Comparison for TEST1.1, second')).toHaveAttribute(
            'src',
            '/seq/TEST1.1/reference-comparison?segment=second',
        );
        await user.click(screen.getByRole('tab', { name: 'Nucleotide sequences' }));
        expect(screen.getByText('Sequence text')).toBeVisible();
        expect(container.querySelector('iframe')).toBeNull();
    });
});
