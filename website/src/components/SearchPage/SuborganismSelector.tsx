import { type FC, useId, useMemo } from 'react';

import type { ReferenceGenomesSequenceNames } from '../../types/referencesGenomes.ts';
import type { MetadataFilterSchema } from '../../utils/search.ts';
import MaterialSymbolsClose from '~icons/material-symbols/close';

type SuborganismSelectorProps = {
    filterSchema: MetadataFilterSchema;
    referenceGenomesSequenceNames: ReferenceGenomesSequenceNames;
    suborganismIdentifierField: string;
    selectedSuborganism: string | null;
    setSelectedSuborganism: (newValue: string | null) => void;
};

/**
 * In the multi pathogen case, this is a prominent selector at the top to choose the suborganism.
 * Choosing a value here is required e.g. to enable mutation search and download of aligned sequences.
 *
 * Does nothing in the single pathogen case.
 */
export const SuborganismSelector: FC<SuborganismSelectorProps> = ({
    filterSchema,
    referenceGenomesSequenceNames,
    suborganismIdentifierField,
    selectedSuborganism,
    setSelectedSuborganism,
}) => {
    const selectId = useId();
    const suborganismNames = Object.keys(referenceGenomesSequenceNames);
    const isSinglePathogen = suborganismNames.length < 2;

    const label = useMemo(() => {
        if (isSinglePathogen) {
            return undefined;
        }

        return filterSchema.filterNameToLabelMap()[suborganismIdentifierField];
    }, [isSinglePathogen, filterSchema, suborganismIdentifierField]);

    if (isSinglePathogen) {
        return null;
    }

    if (label === undefined) {
        throw Error(
            'Cannot render suborganism selector without a label for multi pathogen case. Does the field that you specified in "suborganismIdentifierField" exist in the metadata?',
        );
    }

    return (
        <div className='bg-gray-50 border border-gray-300 rounded-md p-3 mb-3'>
            <label className='block text-xs font-semibold text-gray-700 mb-1' htmlFor={selectId}>
                {label}
            </label>
            <div className='relative'>
                <select
                    id={selectId}
                    value={selectedSuborganism ?? ''}
                    onChange={(e) => setSelectedSuborganism(e.target.value)}
                    className='w-full px-2 py-1.5 rounded border border-gray-300 text-sm bg-white focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-200'
                >
                    <option key={''} value={''} disabled>
                        Select {formatLabel(label)}...
                    </option>
                    {suborganismNames.map((suborganism) => (
                        <option key={suborganism} value={suborganism}>
                            {suborganism}
                        </option>
                    ))}
                </select>
                {selectedSuborganism !== '' && selectedSuborganism !== null && (
                    <button
                        className='absolute top-2 right-6 flex items-center pr-2 h-5 bg-white rounded-sm'
                        onClick={() => setSelectedSuborganism(null)}
                        aria-label={`Clear ${label}`}
                        type='button'
                    >
                        <MaterialSymbolsClose className='w-5 h-5 text-gray-400' />
                    </button>
                )}
            </div>
            <p className='text-xs text-gray-600 mt-2'>
                Select a {formatLabel(label)} to enable mutation search and download of aligned sequences
            </p>
        </div>
    );
};

const formatLabel = (label: string) => {
    if (label === label.toUpperCase()) {
        return label; // all caps, keep as is
    }
    return label.charAt(0).toLowerCase() + label.slice(1);
};
