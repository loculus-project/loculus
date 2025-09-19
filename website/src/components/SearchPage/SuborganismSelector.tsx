import { type FC, useMemo } from 'react';

import type { ReferenceGenomesSequenceNames } from '../../types/referencesGenomes.ts';
import type { MetadataFilterSchema } from '../../utils/search.ts';

type SuborganismSelectorProps = {
    filterSchema: MetadataFilterSchema;
    referenceGenomesSequenceNames: ReferenceGenomesSequenceNames;
    suborganismIdentifierField: string | undefined;
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
    const suborganismNames = Object.keys(referenceGenomesSequenceNames);
    const isSinglePathogen = suborganismNames.length < 2;

    const label = useMemo(() => {
        if (isSinglePathogen || suborganismIdentifierField === undefined) {
            return undefined;
        }

        return filterSchema.filterNameToLabelMap()[suborganismIdentifierField];
    }, [isSinglePathogen, filterSchema, suborganismIdentifierField]);

    if (isSinglePathogen) {
        return null;
    }

    if (label === undefined) {
        throw Error(
            'Cannot render suborganism selector without a label for multi pathogen case. Did you configure a "suborganismIdentifierField"?',
        );
    }

    return (
        <div className='bg-gray-50 border border-gray-300 rounded-md p-3 mb-3'>
            <label className='block text-xs font-semibold text-gray-700 mb-1'>{label}</label>
            <select
                value={selectedSuborganism ?? ''}
                onChange={(e) => setSelectedSuborganism(e.target.value)}
                className='w-full px-2 py-1.5 rounded border border-gray-300 text-sm bg-white focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-200'
            >
                <option key={''} value={''} disabled>
                    Select {label}...
                </option>
                {suborganismNames.map((suborganism) => (
                    <option key={suborganism} value={suborganism}>
                        {suborganism}
                    </option>
                ))}
            </select>
            <p className='text-xs text-gray-600 mt-2'>
                Select a {label} to enable mutation search and download of aligned sequences
            </p>
        </div>
    );
};
