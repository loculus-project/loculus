import type { FC } from 'react';

import type { ReferenceGenomesSequenceNames } from '../../types/referencesGenomes.ts';

type SuborganismSelectorProps = {
    referenceGenomesSequenceNames: ReferenceGenomesSequenceNames;
};

export const SuborganismSelector: FC<SuborganismSelectorProps> = ({ referenceGenomesSequenceNames }) => {
    const suborganismNames = Object.keys(referenceGenomesSequenceNames);

    if (suborganismNames.length < 2) {
        return null;
    }

    return (
        <div className='bg-gray-50 border border-gray-300 rounded-md p-3 mb-3'>
            <label className='block text-xs font-semibold text-gray-700 mb-1'>Suborganism</label>
            <select
                value={value}
                onChange={(e) => onChange(e.target.value)}
                className='w-full px-2 py-1.5 rounded border border-gray-300 text-sm bg-white focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-200'
            >
                {suborganismNames.map((suborganism) => (
                    <option key={suborganism.id} value={suborganism.id}>
                        {suborganism.label}
                    </option>
                ))}
            </select>
            <p className='text-xs text-gray-600 mt-2'>
                Select a sub-organism to enable mutation search and download of aligned sequences
            </p>
        </div>
    );
};
