import type { FC, ReactElement } from 'react';
import { Fragment } from 'react';

import type { SequenceFilter } from '../SearchPage/DownloadDialog/SequenceFilters';
import MaterialSymbolsClose from '~icons/material-symbols/close';

type ActiveFiltersProps = {
    sequenceFilter: SequenceFilter;
    removeFilter?: (key: string) => void;
};

const BADGE_CLASSES =
    'border-primary-600 rounded-sm border border-l-primary-600 bg-gray-100 border-l-8 pl-3 py-1 text-sm flex flex-row';

const SHOW_ALL_THRESHOLD = 6;
const MAX_SHOWN = 3;

const isBlankToken = (v: string) => v === '(blank)';

const Token = ({ text }: { text: string }) => (
    <span className={isBlankToken(text) ? 'italic font-semibold' : 'font-semibold'}>{text}</span>
);

const normalize = (v: string | null | undefined) => v ?? '(blank)';

function renderArrayValues(values: (string | null | undefined)[]): ReactElement {
    const normalized = values.map(normalize);

    // Single value
    if (normalized.length === 1) {
        const only = normalized[0];
        return (
            <span className='text-primary-900'>
                <Token text={only} />
            </span>
        );
    }

    // Show all values if total is below threshold
    if (normalized.length < SHOW_ALL_THRESHOLD) {
        return (
            <span className='text-primary-900'>
                {normalized.map((val, idx) => (
                    <Fragment key={idx}>
                        {idx > 0 && ', '}
                        <Token text={val} />
                    </Fragment>
                ))}
            </span>
        );
    }

    // Truncate when at/above threshold: show first few + count
    const shown = normalized.slice(0, MAX_SHOWN);
    const remaining = normalized.length - MAX_SHOWN;

    return (
        <span className='text-primary-900'>
            {shown.map((val, idx) => (
                <Fragment key={idx}>
                    {idx > 0 && ', '}
                    <Token text={val} />
                </Fragment>
            ))}
            <span className='font-semibold'>… and {remaining} more</span>
        </span>
    );
}

function renderSingleValue(value: string | null | undefined): ReactElement {
    if (value === '') {
        return <span className='text-primary-900 italic'>any</span>;
    }
    if (value == null) {
        return <span className='text-primary-900 italic'>(blank)</span>;
    }
    return <span className='text-primary-900 font-semibold'>{value}</span>;
}

type BadgeProps = {
    label: string;
    content: ReactElement;
    showX: boolean;
    onRemove?: () => void;
    ariaLabel: string;
};

const Badge: FC<BadgeProps> = ({ label, content, showX, onRemove, ariaLabel }) => (
    <div className={BADGE_CLASSES}>
        <span className='text-primary-900 font-light pr-1'>{label}:</span>
        {content}
        {showX ? (
            <button aria-label={ariaLabel} className='inline ml-2 mt-0.5 pr-2' onClick={onRemove}>
                <MaterialSymbolsClose className='w-3 h-4 text-primary-600' />
            </button>
        ) : (
            <div className='pr-4'></div>
        )}
    </div>
);

export const ActiveFilters: FC<ActiveFiltersProps> = ({ sequenceFilter, removeFilter }) => {
    if (sequenceFilter.isEmpty()) return null;
    const showXButton = removeFilter !== undefined;

    const entries = [...sequenceFilter.toDisplayStrings()];

    return (
        <div className='flex flex-row flex-wrap gap-3'>
            {entries.map(([key, [label, value]]) => {
                if (Array.isArray(value)) {
                    return (
                        <Badge
                            key={key}
                            label={label}
                            content={renderArrayValues(value)}
                            showX={showXButton}
                            onRemove={showXButton ? () => removeFilter(key) : undefined}
                            ariaLabel={`remove ${label} filter`}
                        />
                    );
                }

                return (
                    <Badge
                        key={key}
                        label={label}
                        content={renderSingleValue(value)}
                        showX={showXButton}
                        onRemove={showXButton ? () => removeFilter(key) : undefined}
                        ariaLabel='remove filter'
                    />
                );
            })}
        </div>
    );
};
