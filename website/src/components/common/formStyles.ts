/*
 * Shared form-control styling, replacing daisyUI's `input` / `select` /
 * `textarea` / `checkbox` / `radio` component classes. Returns Tailwind class
 * strings reproducing daisyUI v5's look as rendered on this instance:
 *   - text fields / selects: 40px tall, rounded, 1px base-content/20 border,
 *     white fill, 14px text;
 *   - checkboxes: 20px (sm) / 24px, rounded-md, base-content/20 border;
 *   - radios: same but fully round.
 *
 * The checked appearance (checkmark / dot) is provided by the global form reset
 * for `[type=checkbox]:not(.checkbox)` / `[type=radio]:not(.radio)`, so these
 * controls deliberately do NOT carry daisyUI's `.checkbox` / `.radio` classes.
 */
const fieldBase =
    'rounded border border-base-content/20 bg-white text-sm ' +
    'focus:outline-none focus:border-base-content/40 focus:ring-1 focus:ring-base-content/20';

export const inputClasses = `${fieldBase} h-10 px-3`;

export const selectClasses = `${fieldBase} h-10 px-3 pr-8`;

export const textareaClasses = `${fieldBase} px-3 py-2`;

type CheckSize = 'sm' | 'md';

// No `bg-white` here: @tailwindcss/forms supplies the unchecked white fill and
// the checked fill (currentColor → `text-base-content`) + checkmark. A bg-white
// utility would override the checked fill and hide the mark.
const checkBase = 'border border-base-content/20 text-base-content shrink-0';

const checkSizeClasses: Record<CheckSize, string> = {
    sm: 'w-5 h-5',
    md: 'w-6 h-6',
};

export function checkboxClasses(size: CheckSize = 'md'): string {
    return `${checkBase} ${checkSizeClasses[size]} rounded-md`;
}

export function radioClasses(size: CheckSize = 'md'): string {
    return `${checkBase} ${checkSizeClasses[size]} rounded-full`;
}
