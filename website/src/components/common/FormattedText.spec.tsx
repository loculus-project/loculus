import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { FormattedText } from './FormattedText';

describe('FormattedText', () => {
    it('renders plain text without backticks as-is', () => {
        const { container } = render(<FormattedText text='Hello world' />);
        expect(container.textContent).toBe('Hello world');
        expect(container.querySelector('code')).toBeNull();
    });

    it('renders backtick-quoted text as <code> elements', () => {
        const { container } = render(<FormattedText text='Use the `fastaIds` column' />);
        expect(container.textContent).toBe('Use the fastaIds column');
        const code = container.querySelector('code');
        expect(code).not.toBeNull();
        expect(code!.textContent).toBe('fastaIds');
    });

    it('handles multiple backtick-quoted segments', () => {
        const { container } = render(<FormattedText text='Set `foo` and `bar` fields' />);
        expect(container.textContent).toBe('Set foo and bar fields');
        const codes = container.querySelectorAll('code');
        expect(codes).toHaveLength(2);
        expect(codes[0].textContent).toBe('foo');
        expect(codes[1].textContent).toBe('bar');
    });

    it('does not render code elements for a single backtick', () => {
        const { container } = render(<FormattedText text="it's a test" />);
        expect(container.textContent).toBe("it's a test");
        expect(container.querySelector('code')).toBeNull();
    });

    it('handles empty string', () => {
        const { container } = render(<FormattedText text='' />);
        expect(container.textContent).toBe('');
    });
});
