import { type FC, type ReactElement, useMemo, useState } from 'react';

import type { MutationBadgeData, SegmentedMutations, SegmentedMutationStrings } from '../../types/config';
import { Button } from '../common/Button';

export type SubProps = {
    position: number;
    mutationTo: string;
    mutationFrom: string;
    sequenceName: string | null;
};

export type Props = {
    values: MutationBadgeData[];
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
                <span className='px-[4px] py-[2px] bg-gray-200'>{position}</span>
                <span className='px-[4px] py-[2px] rounded-e-[3px]' style={{ background: getColor(mutationTo) }}>
                    {mutationTo}
                </span>
            </span>
        </li>
    );
};

/* eslint-disable @typescript-eslint/naming-convention -- non-conformal property keys are ok here */
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
/* eslint-enable @typescript-eslint/naming-convention */

export function getColor(code: string): string {
    return COLORS[code] ?? COLORS.X;
}

const MAX_INITIAL_NUMBER_BADGES = 20;

export const SubstitutionsContainers = ({ values }: { values: SegmentedMutations[] }) => {
    return values.map(({ segment, mutations }) => (
        <div key={segment}>
            <h2 className='py-1 my-1 font-semibold border-b'>{segment}</h2>
            <SubstitutionsContainer values={mutations} />
        </div>
    ));
};

export const MutationStringContainers = ({ values }: { values: SegmentedMutationStrings[] }) => {
    return values.map(({ segment, mutations }) => (
        <div key={segment}>
            <h2 className='py-1 my-1 font-semibold border-b'>{segment}</h2>
            {mutations.join(', ')}
        </div>
    ));
};

export const SubstitutionsContainer: FC<Props> = ({ values }) => {
    const [showMore, setShowMore] = useState(false);

    const { alwaysVisible, initiallyHidden } = useMemo(() => {
        let alwaysVisible: ReactElement[] = [];
        let initiallyHidden: ReactElement[] = [];
        const elements = values.map(({ mutationFrom, mutationTo, position, sequenceName }, index) => (
            <span key={index}>
                <SubBadge
                    sequenceName={sequenceName}
                    mutationFrom={mutationFrom}
                    position={position}
                    mutationTo={mutationTo}
                />{' '}
            </span>
        ));
        if (elements.length <= MAX_INITIAL_NUMBER_BADGES) {
            alwaysVisible = elements;
        } else {
            alwaysVisible = elements.slice(0, MAX_INITIAL_NUMBER_BADGES - 2);
            initiallyHidden = elements.slice(MAX_INITIAL_NUMBER_BADGES - 2);
        }
        return { alwaysVisible, initiallyHidden };
    }, [values]);

    return (
        <div>
            {alwaysVisible}
            {initiallyHidden.length > 0 &&
                (showMore ? (
                    <>
                        {initiallyHidden}
                        <Button onClick={() => setShowMore(false)} className='underline'>
                            Show less
                        </Button>
                    </>
                ) : (
                    <Button
                        onClick={() => {
                            setShowMore(true);
                        }}
                        className='underline'
                    >
                        Show more
                    </Button>
                ))}
        </div>
    );
};
