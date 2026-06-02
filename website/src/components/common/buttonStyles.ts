/*
 * Single source of truth for button styling, replacing the daisyUI `btn`
 * component classes. Returns a Tailwind class string so it can be used from
 * React components, `.astro` templates, and plain anchors alike.
 *
 * The shape (height, padding, font, radius, border) reproduces daisyUI v5's
 * `btn` / `btn-sm` / `btn-xs` / `btn-circle` as rendered on this instance; the
 * `variant` colours map the combinations actually used in the app:
 *   - neutral: bare `btn` (base-200 fill, base-300 border)
 *   - primary: `btn loculusColor text-white`
 *   - ghost:   `btn btn-ghost`
 *   - outline: `btn btn-outline`
 */
export type ButtonSize = 'md' | 'sm' | 'xs';
export type ButtonVariant = 'neutral' | 'primary' | 'ghost' | 'outline' | 'unstyled';

interface ButtonClassOptions {
    size?: ButtonSize;
    variant?: ButtonVariant;
    /** Square icon button with a fully rounded shape (daisyUI `btn-circle`). */
    circle?: boolean;
    /** Extra classes appended after the generated ones. */
    className?: string;
}

const base =
    'inline-flex items-center justify-center gap-1.5 font-semibold rounded border transition-colors duration-200 ' +
    'disabled:pointer-events-none disabled:bg-base-content/10 disabled:text-base-content/20 disabled:border-transparent';

const sizeClasses: Record<ButtonSize, string> = {
    md: 'h-10 px-4 text-sm',
    sm: 'h-8 px-3 text-xs',
    xs: 'h-6 px-2 text-[11px]',
};

const circleSizeClasses: Record<ButtonSize, string> = {
    md: 'w-10 h-10 p-0 rounded-full',
    sm: 'w-8 h-8 p-0 rounded-full',
    xs: 'w-6 h-6 p-0 rounded-full',
};

const variantClasses: Record<ButtonVariant, string> = {
    neutral: 'bg-base-200 text-base-content border-base-300 hover:bg-base-300',
    primary: 'bg-[var(--color-main)] text-white border-transparent hover:bg-primary-700',
    ghost: 'bg-transparent border-transparent hover:bg-base-200',
    outline: 'bg-transparent border-base-content text-base-content hover:bg-base-content hover:text-base-100',
    // Shape only: caller supplies all colours (bg/text/border) via `className`.
    unstyled: '',
};

export function buttonClasses({
    size = 'md',
    variant = 'neutral',
    circle = false,
    className = '',
}: ButtonClassOptions = {}): string {
    return [base, circle ? circleSizeClasses[size] : sizeClasses[size], variantClasses[variant], className]
        .filter(Boolean)
        .join(' ');
}
