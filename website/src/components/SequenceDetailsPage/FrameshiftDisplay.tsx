import React from 'react';

interface FrameshiftEntry {
    cdsName: string;
    nucRel: { begin: number; end: number };
    nucAbs: { begin: number; end: number }[];
    codon: { begin: number; end: number };
    gapsLeading: { begin: number; end: number };
    gapsTrailing: { begin: number; end: number };
}

interface FrameshiftDisplayProps {
    value: string;
}

const FrameshiftDisplay: React.FC<FrameshiftDisplayProps> = ({ value }) => {
    let frameshiftData: FrameshiftEntry[];

    try {
        frameshiftData = JSON.parse(value.replaceAll("'", '"'));
    } catch (error) {
        return <span className='text-red-600 text-xs'>Invalid JSON</span>;
    }
    if (frameshiftData.length === 0) {
        return <span className='italic'>None</span>;
    }

    return (
        <div className='flex flex-wrap gap-1'>
            {frameshiftData.map((entry, index) => (
                <div
                    key={index}
                    className='inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 opacity-100'
                >
                    {entry.cdsName}
                    {entry.codon.begin}-{entry.codon.end}: nt{entry.nucRel.begin}-{entry.nucRel.end}
                    <span className='ml-1 px-1.5 py-0.5 rounded-full text-xs bg-gray-100'>
                        {entry.gapsLeading.begin}-{entry.gapsLeading.end} / {entry.gapsTrailing.begin}-
                        {entry.gapsTrailing.end}
                    </span>
                </div>
            ))}
        </div>
    );
};

export default FrameshiftDisplay;
