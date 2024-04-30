import { type FC } from 'react';

import type { MutationProportionCount } from '../../types/lapis';

export type SubProps = {
    position: number;
    mutationTo: string;
    mutationFrom: string;
    sequenceName: string | null;
};

export const SubBadge: FC<SubProps> = ({ position, mutationTo, mutationFrom, sequenceName }) => {
    return (
        <li key={position} className='inline-block'>
            <span className='rounded-[3px] font-mono text-xs overflow-auto'>
                {sequenceName === null ? (
                    <span className='px-[4px] py-[2px] rounded-s-[3px]' style={{ background: getColor(mutationFrom) }}>
                        {mutationFrom}
                    </span>
                ) : (
                    <>
                        <span className='px-[4px] py-[2px] rounded-s-[3px] bg-gray-200'>{sequenceName}:</span>
                        <span className='px-[4px] py-[2px]' style={{ background: getColor(mutationFrom) }}>
                            {mutationFrom}
                        </span>
                    </>
                )}
                <span className='px-[4px] py-[2px] bg-gray-200'>{position + 1}</span>
                <span className='px-[4px] py-[2px] rounded-e-[3px]' style={{ background: getColor(mutationTo) }}>
                    {mutationTo}
                </span>
            </span>
        </li>
    );
};

// Based from http://ugene.net/forum/YaBB.pl?num=1337064665
export const COLORS: Record<string, string> = {
    'A': '#db8070',
    'C': '#859dfc',
    'G': '#c2b553',
    'T': '#7fbb81',
    'V': '#e5e57c',
    'L': '#e5e550',
    'I': '#e5e514',
    'B': '#e54c4c',
    'D': '#e5774e',
    'E': '#e59c6c',
    'F': '#e2e54d',
    'H': '#9ddde5',
    'K': '#b4a2e5',
    'M': '#b7e525',
    'N': '#e57875',
    'P': '#b6b5e5',
    'Q': '#e5aacd',
    'R': '#878fe5',
    'S': '#e583d8',
    'W': '#4aa7e5',
    'X': '#aaaaaa',
    'Y': '#57cfe5',
    'Z': '#777777',
    '*': '#777777',
    '-': '#444444',
};

export function getColor(code: string): string {
    return COLORS[code] ?? COLORS.X;
}

export const SubstitutionsContainer = ({ values }: { values: MutationProportionCount[] }) => {
    return values.map(({ mutationFrom, mutationTo, position, sequenceName }) => (
        <span>
            <SubBadge
                sequenceName={sequenceName}
                mutationFrom={mutationFrom}
                position={position}
                mutationTo={mutationTo}
            />{' '}
        </span>
    ));
};
