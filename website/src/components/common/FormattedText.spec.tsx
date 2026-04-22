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

    it('handles odd number of backticks gracefully', () => {
        const { container } = render(<FormattedText text='Set `foo` and `bar' />);
        expect(container.textContent).toBe('Set foo and `bar');
        expect(container.querySelectorAll('code')).toHaveLength(1);
    });

    it('handles empty string', () => {
        const { container } = render(<FormattedText text='' />);
        expect(container.textContent).toBe('');
    });

    it('renders a bare URL surrounded by spaces as a link', () => {
        const { container } = render(<FormattedText text='See https://example.com for details' formatLinks />);
        expect(container.textContent).toBe('See https://example.com for details');
        const link = container.querySelector('a');
        expect(link).not.toBeNull();
        expect(link!.getAttribute('href')).toBe('https://example.com');
        expect(link!.getAttribute('target')).toBe('_blank');
        expect(link!.getAttribute('rel')).toBe('noopener noreferrer');
    });

    it('renders a bare URL at the start of the string as a link', () => {
        const { container } = render(<FormattedText text='https://example.com for details' formatLinks />);
        const link = container.querySelector('a');
        expect(link).not.toBeNull();
        expect(link!.getAttribute('href')).toBe('https://example.com');
    });

    it('renders a bare URL at the end of the string as a link', () => {
        const { container } = render(<FormattedText text='See https://example.com' formatLinks />);
        const link = container.querySelector('a');
        expect(link).not.toBeNull();
        expect(link!.getAttribute('href')).toBe('https://example.com');
    });

    it('renders multiple links', () => {
        const { container } = render(
            <FormattedText text='See https://example.com and https://other.com' formatLinks />,
        );
        const links = container.querySelectorAll('a');
        expect(links).toHaveLength(2);
        expect(links[0].getAttribute('href')).toBe('https://example.com');
        expect(links[1].getAttribute('href')).toBe('https://other.com');
    });

    it('does not render a link for text without http/https scheme', () => {
        const { container } = render(<FormattedText text='See example.com for details' formatLinks />);
        expect(container.querySelector('a')).toBeNull();
    });

    it('renders both links and code', () => {
        const { container } = render(<FormattedText text='Use `foo` or see https://example.com' formatLinks />);
        const code = container.querySelector('code');
        const link = container.querySelector('a');
        expect(code).not.toBeNull();
        expect(link).not.toBeNull();
        expect(code!.textContent).toBe('foo');
        expect(link!.getAttribute('href')).toBe('https://example.com');
    });

    it('does not render a link inside a code span', () => {
        const { container } = render(<FormattedText text='Use `https://example.com` for details' formatLinks />);
        expect(container.querySelector('code')!.textContent).toBe('https://example.com');
        expect(container.querySelector('a')).toBeNull();
    });

    it('does not render a link when formatLinks is false', () => {
        const { container } = render(
            <FormattedText text='Use `https://example.com` for details' formatLinks={false} />,
        );
        expect(container.querySelector('code')!.textContent).toBe('https://example.com');
        expect(container.querySelector('a')).toBeNull();
    });
});
