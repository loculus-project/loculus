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

type PaginationButtonProps = {
    target: number;
    isDisabled: boolean;
    isSelected: boolean;
    label: string;
    onChange: (page: number) => void;
    children: ReactNode;
};

type PageItem = number | 'ellipsis';

const getPageItems = (page: number, count: number): PageItem[] => {
    const range = (start: number, end: number) => Array.from({ length: end - start + 1 }, (_, i) => start + i);

    if (count <= 7) return range(1, count);

    // Always shows the first and last page plus one page either side of the current one
    // e.g: 1 ... 4 5 6 ... 20
    let middleStart = page - 1;
    if (middleStart < 3) middleStart = 3;
    if (middleStart > count - 4) middleStart = count - 4;
    const middleEnd = middleStart + 2;
    const hasLeftGap = middleStart > 3;
    const hasRightGap = middleEnd < count - 2;

    return [
        1,
        hasLeftGap ? 'ellipsis' : 2,
        ...range(middleStart, middleEnd),
        hasRightGap ? 'ellipsis' : count - 1,
        count,
    ];
};

const itemClassName = 'h-8 min-w-8 px-1.5 mx-[3px] flex items-center justify-center rounded text-sm';

const PaginationButton: FC<PaginationButtonProps> = ({ target, isDisabled, isSelected, label, children, onChange }) => (
    <Button
        type='button'
        className={`${itemClassName} border transition-colors duration-250 ${
            isSelected
                ? 'border-primary-400 bg-primary-100 text-primary-700 hover:bg-primary-200'
                : 'border-gray-300 text-gray-800 hover:bg-gray-100'
        } ${isDisabled ? 'opacity-40 pointer-events-none' : ''}`}
        disabled={isDisabled}
        aria-label={label}
        aria-current={isSelected ? 'page' : undefined}
        onClick={() => onChange(target)}
    >
        {children}
    </Button>
);

export const Pagination: FC<PaginationProps> = ({ count, page, onChange, className }) => {
    return (
        <nav aria-label='pagination' className={className}>
            <ul className='flex flex-wrap items-center'>
                <li>
                    <PaginationButton
                        target={page - 1}
                        isDisabled={page <= 1}
                        isSelected={false}
                        label='Go to previous page'
                        onChange={onChange}
                    >
                        <MdiChevronLeft className='w-5 h-5' />
                    </PaginationButton>
                </li>
                {getPageItems(page, count).map((item, index) => (
                    <li key={item === 'ellipsis' ? `ellipsis-${index}` : item}>
                        {item === 'ellipsis' ? (
                            <span className={`${itemClassName} text-gray-800`}>…</span>
                        ) : (
                            <PaginationButton
                                target={item}
                                isDisabled={false}
                                isSelected={item === page}
                                label={`Go to page ${item}`}
                                onChange={onChange}
                            >
                                {item}
                            </PaginationButton>
                        )}
                    </li>
                ))}
                <li>
                    <PaginationButton
                        target={page + 1}
                        isDisabled={page >= count}
                        isSelected={false}
                        label='Go to next page'
                        onChange={onChange}
                    >
                        <MdiChevronRight className='w-5 h-5' />
                    </PaginationButton>
                </li>
            </ul>
        </nav>
    );
};
