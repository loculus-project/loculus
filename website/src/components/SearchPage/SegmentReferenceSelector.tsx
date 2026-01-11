import { Tab, TabGroup, TabList, TabPanel, TabPanels } from '@headlessui/react';
import { type FC, useId } from 'react';

import type { ReferenceGenomesLightweightSchema } from '../../types/referencesGenomes.ts';
import type { SegmentReferenceSelections } from '../../utils/sequenceTypeHelpers.ts';
import DisabledUntilHydrated from '../DisabledUntilHydrated.tsx';
import { Button } from '../common/Button';
import MaterialSymbolsClose from '~icons/material-symbols/close';

type SegmentReferenceSelectorProps = {
    schema: ReferenceGenomesLightweightSchema;
    selectedReferences: SegmentReferenceSelections;
    setReferenceForSegment: (segment: string, reference: string | null) => void;
};

/**
 * Segment-first mode selector: allows selecting a reference per segment using a tabbed interface.
 * Each tab represents a segment, and within each tab users can select which reference to use.
 */
export const SegmentReferenceSelector: FC<SegmentReferenceSelectorProps> = ({
    schema,
    selectedReferences,
    setReferenceForSegment,
}) => {
    const segments = Object.keys(schema.segments);
    const isSingleSegment = segments.length === 1;

    // For single segment, show simplified UI without tabs
    if (isSingleSegment) {
        const segmentName = segments[0];
        const segmentData = schema.segments[segmentName];
        return (
            <div className='bg-gray-50 border border-gray-300 rounded-md p-3 mb-3'>
                <SegmentReferenceDropdown
                    segmentName={segmentName}
                    availableReferences={segmentData.references}
                    selectedReference={selectedReferences[segmentName] ?? null}
                    onChange={(ref) => setReferenceForSegment(segmentName, ref)}
                />
                <p className='text-xs text-gray-600 mt-2'>
                    Select a reference to enable mutation search and download of aligned sequences
                </p>
            </div>
        );
    }

    // Multi-segment: show tabs
    return (
        <div className='bg-gray-50 border border-gray-300 rounded-md p-3 mb-3'>
            <DisabledUntilHydrated>
                <TabGroup>
                    <TabList className='flex space-x-1 border-b border-gray-300 mb-3'>
                        {segments.map((segmentName) => {
                            const hasSelection = selectedReferences[segmentName] !== null;
                            return (
                                <Tab
                                    key={segmentName}
                                    className={({ selected }) =>
                                        `px-3 py-2 text-sm font-medium rounded-t-md border-b-2 transition-colors focus:outline-none focus:ring-2 focus:ring-primary-200 ${
                                            selected
                                                ? 'border-primary-500 text-primary-700 bg-white'
                                                : 'border-transparent text-gray-600 hover:text-gray-800 hover:bg-gray-100'
                                        }`
                                    }
                                >
                                    <span className='flex items-center gap-1.5'>
                                        {segmentName}
                                        {hasSelection && (
                                            <span
                                                className='inline-block w-2 h-2 bg-primary-500 rounded-full'
                                                title='Reference selected'
                                            />
                                        )}
                                    </span>
                                </Tab>
                            );
                        })}
                    </TabList>
                    <TabPanels>
                        {segments.map((segmentName) => {
                            const segmentData = schema.segments[segmentName];
                            return (
                                <TabPanel key={segmentName} className='focus:outline-none'>
                                    <SegmentReferenceDropdown
                                        segmentName={segmentName}
                                        availableReferences={segmentData.references}
                                        selectedReference={selectedReferences[segmentName] ?? null}
                                        onChange={(ref) => setReferenceForSegment(segmentName, ref)}
                                    />
                                </TabPanel>
                            );
                        })}
                    </TabPanels>
                </TabGroup>
            </DisabledUntilHydrated>
            <p className='text-xs text-gray-600 mt-2'>
                Select references for each segment to enable mutation search and download of aligned sequences
            </p>
        </div>
    );
};

type SegmentReferenceDropdownProps = {
    segmentName: string;
    availableReferences: string[];
    selectedReference: string | null;
    onChange: (reference: string | null) => void;
};

/**
 * Reference dropdown for a single segment.
 */
const SegmentReferenceDropdown: FC<SegmentReferenceDropdownProps> = ({
    segmentName,
    availableReferences,
    selectedReference,
    onChange,
}) => {
    const selectId = useId();

    return (
        <div>
            <label className='block text-xs font-semibold text-gray-700 mb-1' htmlFor={selectId}>
                Reference for {segmentName}
            </label>
            <div className='relative'>
                <select
                    id={selectId}
                    value={selectedReference ?? ''}
                    onChange={(e) => onChange(e.target.value || null)}
                    className='w-full px-2 py-1.5 rounded border border-gray-300 text-sm bg-white focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-200'
                >
                    <option key='' value='' disabled>
                        Select reference...
                    </option>
                    {availableReferences.map((reference) => (
                        <option key={reference} value={reference}>
                            {reference}
                        </option>
                    ))}
                </select>
                {selectedReference !== null && (
                    <Button
                        className='absolute top-2 right-6 flex items-center pr-2 h-5 bg-white rounded-sm'
                        onClick={() => onChange(null)}
                        aria-label={`Clear reference for ${segmentName}`}
                        type='button'
                    >
                        <MaterialSymbolsClose className='w-5 h-5 text-gray-400' />
                    </Button>
                )}
            </div>
        </div>
    );
};
