import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';

import { GenomePreviewToggle } from './GenomePreviewToggle';
import { testServer } from '../../../../vitest.setup';

const segments = [
    { name: 'first', lapisName: 'first', displayName: 'First segment' },
    { name: 'second', lapisName: 'second' },
];

describe('GenomePreviewToggle', () => {
    it('loads only when enabled, switches segments, and unloads when disabled', async () => {
        testServer.use(http.get('http://localhost:3000/seq/TEST1.1/genome', () => HttpResponse.html('<html></html>')));
        const user = userEvent.setup();
        const { container } = render(<GenomePreviewToggle accessionVersion='TEST1.1' segments={segments} />);
        expect(container.querySelector('iframe')).toBeNull();
        const toggle = screen.getByRole('button', { name: 'Genome viewer' });
        await user.click(toggle);
        expect(toggle).toHaveAttribute('aria-pressed', 'true');
        expect(screen.getByTitle('Genome viewer for TEST1.1, First segment')).toHaveAttribute(
            'src',
            '/seq/TEST1.1/genome?segment=first',
        );
        await user.selectOptions(screen.getByRole('combobox'), 'second');
        expect(screen.getByTitle('Genome viewer for TEST1.1, second')).toHaveAttribute(
            'src',
            '/seq/TEST1.1/genome?segment=second',
        );
        await user.click(toggle);
        expect(container.querySelector('iframe')).toBeNull();
    });

    it('hides the control when no reference segment is available', () => {
        const { container } = render(<GenomePreviewToggle accessionVersion='TEST1.1' segments={[]} />);
        expect(container).toBeEmptyDOMElement();
    });
});
