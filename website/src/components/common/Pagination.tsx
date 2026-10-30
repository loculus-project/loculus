import type { FC, ReactNode } from 'react';

import { Button } from './Button';
import MdiChevronLeft from '~icons/mdi/chevron-left';
import MdiChevronRight from '~icons/mdi/chevron-right';

type PaginationProps = {
    count: number;
    page: number;
    onChange: (page: number) => void;
    className?: string;
};

type PageItem = number | 'ellipsis';

const range = (start: number, end: number) => Array.from({ length: end - start + 1 }, (_, i) => start + i);

// Always shows the first and last page plus one page either side of the current one
// e.g: 1 ... 4 5 6 ... 20
const getPageItems = (page: number, count: number): PageItem[] => {
    if (count <= 7) {
        return range(1, count);
    }
    const start = Math.max(Math.min(page - 1, count - 4), 3);
    const end = Math.min(Math.max(page + 1, 5), count - 2);
    return [1, start > 3 ? 'ellipsis' : 2, ...range(start, end), end < count - 2 ? 'ellipsis' : count - 1, count];
};

const itemClassName = 'h-8 min-w-8 px-1.5 mx-[3px] flex items-center justify-center rounded text-sm';

export const Pagination: FC<PaginationProps> = ({ count, page, onChange, className }) => {
    const pageButton = (
        target: number,
        isDisabled: boolean,
        isSelected: boolean,
        label: string,
        content: ReactNode,
    ) => (
        <Button
            type='button'
            className={`${itemClassName} border ${
                isSelected
                    ? 'border-primary-400 bg-primary-100 text-primary-700'
                    : 'border-gray-300 text-gray-800 hover:bg-gray-100'
            } ${isDisabled ? 'opacity-40 pointer-events-none' : ''}`}
            disabled={isDisabled}
            aria-label={label}
            aria-current={isSelected ? 'page' : undefined}
            onClick={() => onChange(target)}
        >
            {content}
        </Button>
    );

    return (
        <nav aria-label='pagination' className={className}>
            <ul className='flex flex-wrap items-center'>
                <li>
                    {pageButton(
                        page - 1,
                        page <= 1,
                        false,
                        'Go to previous page',
                        <MdiChevronLeft className='w-5 h-5' />,
                    )}
                </li>
                {getPageItems(page, count).map((item, index) => (
                    <li key={item === 'ellipsis' ? `ellipsis-${index}` : item}>
                        {item === 'ellipsis' ? (
                            <span className={`${itemClassName} text-gray-800`}>…</span>
                        ) : (
                            pageButton(item, false, item === page, `Go to page ${item}`, item)
                        )}
                    </li>
                ))}
                <li>
                    {pageButton(
                        page + 1,
                        page >= count,
                        false,
                        'Go to next page',
                        <MdiChevronRight className='w-5 h-5' />,
                    )}
                </li>
            </ul>
        </nav>
    );
};
