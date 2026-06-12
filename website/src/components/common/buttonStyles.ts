export type ButtonSize = 'md' | 'sm' | 'xs';
export type ButtonVariant = 'neutral' | 'primary' | 'ghost' | 'outline' | 'unstyled';

interface ButtonClassOptions {
    size?: ButtonSize;
    variant?: ButtonVariant;
    circle?: boolean;
    className?: string;
}

const base =
    'inline-flex items-center justify-center gap-1.5 font-semibold rounded-md border transition-colors duration-200 ' +
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
    outline: 'bg-white border-primary-600 text-primary-600 hover:bg-primary-600 hover:text-white',
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
