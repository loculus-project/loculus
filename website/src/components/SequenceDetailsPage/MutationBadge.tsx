import { type FC, type ReactElement, useMemo, useState } from 'react';

import { PlainValueDisplay } from './PlainValueDisplay';
import type { MutationBadgeData, SegmentedMutations, SegmentedMutationStrings } from '../../types/config';
import { Button } from '../common/Button';

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

/**
 * Lays out per-segment/gene groups compactly: the group name in a narrow left column and its
 * contents wrapping to the right, one row per group. When `maxInitialGroups` is set and there
 * are more groups than that, the rest are hidden behind a "Show all" toggle.
 */
const SegmentGroups = ({
    groups,
    maxInitialGroups,
}: {
    groups: { key: string; name: string; content: ReactElement }[];
    maxInitialGroups?: number;
}) => {
    const [showAll, setShowAll] = useState(false);

    const unnamed = groups.length === 1 && groups[0].name === '';
    if (unnamed) {
        return groups[0].content;
    }

    const collapsible = maxInitialGroups !== undefined && groups.length > maxInitialGroups;
    const visibleGroups = collapsible && !showAll ? groups.slice(0, maxInitialGroups) : groups;

    return (
        <div>
            <dl className='divide-y divide-gray-100'>
                {visibleGroups.map(({ key, name, content }) => (
                    <div
                        key={key}
                        className='grid grid-cols-1 gap-x-4 gap-y-1 py-1.5 sm:grid-cols-[8rem_minmax(0,1fr)]'
                    >
                        <dt className='truncate text-xs font-semibold leading-6 text-gray-700' title={name}>
                            {name}
                        </dt>
                        <dd className='min-w-0'>{content}</dd>
                    </div>
                ))}
            </dl>
            {collapsible && (
                <Button onClick={() => setShowAll(!showAll)} className='mt-2 text-sm text-primary-700 underline'>
                    {showAll ? 'Show fewer' : `Show all ${groups.length}`}
                </Button>
            )}
        </div>
    );
};

export const SubstitutionsContainers = ({
    values,
    segmentDisplayNameMap,
    maxInitialGroups,
}: {
    values: SegmentedMutations[];
    segmentDisplayNameMap?: Record<string, string>;
    maxInitialGroups?: number;
}) => (
    <SegmentGroups
        maxInitialGroups={maxInitialGroups}
        groups={values.map(({ segment, mutations }) => ({
            key: segment,
            name: segmentDisplayNameMap?.[segment] ?? segment,
            content: <SubstitutionsContainer values={mutations} />,
        }))}
    />
);

export type Props = {
    values: MutationBadgeData[];
};

export const SubstitutionsContainer: FC<Props> = ({ values }) => {
    const [showMore, setShowMore] = useState(false);

    const { alwaysVisible, initiallyHidden } = useMemo(() => {
        let alwaysVisible: ReactElement[] = [];
        let initiallyHidden: ReactElement[] = [];
        const elements = values.map(({ mutationFrom, mutationTo, position, sequenceName }, index) => (
            <SubBadge
                key={index}
                sequenceName={sequenceName}
                mutationFrom={mutationFrom}
                position={position}
                mutationTo={mutationTo}
            />
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
        <ul className='list-none p-0 m-0 flex flex-wrap gap-1'>
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
        </ul>
    );
};

export const MutationStringContainers = ({
    values,
    segmentDisplayNameMap,
    maxInitialGroups,
}: {
    values: SegmentedMutationStrings[];
    segmentDisplayNameMap?: Record<string, string>;
    maxInitialGroups?: number;
}) => (
    <SegmentGroups
        maxInitialGroups={maxInitialGroups}
        groups={values.map(({ segment, mutations }) => ({
            key: segment,
            name: segmentDisplayNameMap?.[segment] ?? segment,
            content: (
                <div className='text-sm leading-6'>
                    <PlainValueDisplay value={mutations.flat().join(', ')} />
                </div>
            ),
        }))}
    />
);
