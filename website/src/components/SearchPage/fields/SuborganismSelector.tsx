import { type FC } from 'react';

type SuborganismSelectorProps = {
    value: string;
    onChange: (value: string) => void;
};

const MOCK_SUBORGANISMS = [
    { id: '', label: 'Select suborganism...', description: '' },
    { id: 'org-a', label: 'Organism A', description: '' },
    { id: 'org-b', label: 'Organism B', description: '' },
    { id: 'org-c', label: 'Organism C', description: '' },
];

export const SuborganismSelector: FC<SuborganismSelectorProps> = ({ value, onChange }) => {
    return (
        <div className='bg-gray-50 border border-gray-300 rounded-md p-3 mb-3'>
            <label className='block text-xs font-semibold text-gray-700 mb-1'>
                Suborganism
            </label>
            <select
                value={value}
                onChange={(e) => onChange(e.target.value)}
                className='w-full px-2 py-1.5 rounded border border-gray-300 text-sm bg-white focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-200'
            >
                {MOCK_SUBORGANISMS.map((suborganism) => (
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