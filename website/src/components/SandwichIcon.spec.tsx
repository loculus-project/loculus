import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { SandwichIcon } from './SandwichIcon';

describe('SandwichIcon', () => {
    it('renders hamburger icon with closed state', () => {
        const { container } = render(<SandwichIcon isOpen={false} />);

        const hamburger = container.querySelector('.hamburger');
        expect(hamburger).toBeInTheDocument();

        // Check that all three burger lines are rendered
        const burgerLines = container.querySelectorAll('.burger');
        expect(burgerLines).toHaveLength(3);
    });

    it('applies closed state classes when isOpen is false', () => {
        const { container } = render(<SandwichIcon isOpen={false} />);

        expect(container.querySelector('.burger1--closed')).toBeInTheDocument();
        expect(container.querySelector('.burger2--closed')).toBeInTheDocument();
        expect(container.querySelector('.burger3--closed')).toBeInTheDocument();

        // Should not have open classes
        expect(container.querySelector('.burger1--open')).not.toBeInTheDocument();
        expect(container.querySelector('.burger2--open')).not.toBeInTheDocument();
        expect(container.querySelector('.burger3--open')).not.toBeInTheDocument();
    });

    it('applies open state classes when isOpen is true', () => {
        const { container } = render(<SandwichIcon isOpen={true} />);

        expect(container.querySelector('.burger1--open')).toBeInTheDocument();
        expect(container.querySelector('.burger2--open')).toBeInTheDocument();
        expect(container.querySelector('.burger3--open')).toBeInTheDocument();

        // Should not have closed classes
        expect(container.querySelector('.burger1--closed')).not.toBeInTheDocument();
        expect(container.querySelector('.burger2--closed')).not.toBeInTheDocument();
        expect(container.querySelector('.burger3--closed')).not.toBeInTheDocument();
    });

    it('applies primary color classes to burger lines', () => {
        const { container } = render(<SandwichIcon isOpen={false} />);

        const burgerLines = container.querySelectorAll('.burger');
        burgerLines.forEach((line) => {
            expect(line).toHaveClass('bg-primary-600');
        });
    });

    it('includes CSS styles for animations', () => {
        const { container } = render(<SandwichIcon isOpen={false} />);

        const styleElement = container.querySelector('style');
        expect(styleElement).toBeInTheDocument();
        
        const styles = styleElement?.textContent;
        expect(styles).toContain('.hamburger');
        expect(styles).toContain('.burger');
        expect(styles).toContain('transform: rotate(45deg)');
        expect(styles).toContain('transform: rotate(-45deg)');
        expect(styles).toContain('opacity: 0');
        expect(styles).toContain('transition: all 0.3s linear');
    });

    it('has proper structure with relative positioning', () => {
        const { container } = render(<SandwichIcon isOpen={false} />);

        const wrapper = container.firstChild as HTMLElement;
        expect(wrapper).toHaveClass('relative');
        
        const hamburger = wrapper.querySelector('.hamburger');
        expect(hamburger).toBeInTheDocument();
    });

    it('defines consistent burger line dimensions and spacing', () => {
        const { container } = render(<SandwichIcon isOpen={false} />);

        const styleElement = container.querySelector('style');
        const styles = styleElement?.textContent;
        
        // Check that dimensions are defined in the styles
        expect(styles).toContain('width: 2rem');
        expect(styles).toContain('height: 2rem');
        expect(styles).toContain('height: 0.25rem');
        expect(styles).toContain('border-radius: 10px');
    });

    it('sets proper transform origins for animations', () => {
        const { container } = render(<SandwichIcon isOpen={false} />);

        const styleElement = container.querySelector('style');
        const styles = styleElement?.textContent;
        
        expect(styles).toContain('transform-origin: 1px');
    });

    it('handles state transitions smoothly', () => {
        const { container, rerender } = render(<SandwichIcon isOpen={false} />);

        // Initially closed
        expect(container.querySelector('.burger1--closed')).toBeInTheDocument();
        expect(container.querySelector('.burger2--closed')).toBeInTheDocument();
        expect(container.querySelector('.burger3--closed')).toBeInTheDocument();

        // Rerender with open state
        rerender(<SandwichIcon isOpen={true} />);

        expect(container.querySelector('.burger1--open')).toBeInTheDocument();
        expect(container.querySelector('.burger2--open')).toBeInTheDocument();
        expect(container.querySelector('.burger3--open')).toBeInTheDocument();
    });

    it('maintains consistent styling across state changes', () => {
        const { container, rerender } = render(<SandwichIcon isOpen={false} />);

        const initialBurgerLines = container.querySelectorAll('.burger.bg-primary-600');
        expect(initialBurgerLines).toHaveLength(3);

        rerender(<SandwichIcon isOpen={true} />);

        const openBurgerLines = container.querySelectorAll('.burger.bg-primary-600');
        expect(openBurgerLines).toHaveLength(3);
    });

    it('provides visual feedback for menu state', () => {
        const { container } = render(<SandwichIcon isOpen={false} />);

        // Closed state should show horizontal lines (hamburger)
        expect(container.querySelector('.burger1--closed')).toBeInTheDocument();
        expect(container.querySelector('.burger2--closed')).toBeInTheDocument();
        expect(container.querySelector('.burger3--closed')).toBeInTheDocument();

        // The CSS should transform these into an X when open
        const styleElement = container.querySelector('style');
        const styles = styleElement?.textContent;
        expect(styles).toContain('rotate(45deg)');
        expect(styles).toContain('rotate(-45deg)');
    });
});