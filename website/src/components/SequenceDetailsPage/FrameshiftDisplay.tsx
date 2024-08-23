import React from 'react';
import { Tooltip } from 'react-tooltip';

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
                    data-tooltip-id={'frameshift-tooltip' + index}
                >
                    <Tooltip
                        id={'frameshift-tooltip' + index}
                        content={
                            'Frameshift codon range: ' +
                            entry.codon.begin +
                            '-' +
                            entry.codon.end +
                            (entry.gapsLeading.end > entry.gapsLeading.begin
                                ? '. Leading deleted codon range: ' +
                                  entry.gapsLeading.begin +
                                  '-' +
                                  entry.gapsLeading.begin
                                : '') +
                            (entry.gapsTrailing.end > entry.gapsTrailing.begin
                                ? '. Trailing deleted codon range: ' +
                                  entry.gapsTrailing.begin +
                                  '-' +
                                  entry.gapsTrailing.end
                                : '')
                        }
                    />
                    {entry.cdsName}:
                    {entry.gapsLeading.end > entry.gapsLeading.begin && (
                        <div>
                            <span className='line-through'>
                                {entry.gapsLeading.begin}-{entry.gapsLeading.end}
                            </span>
                            :
                        </div>
                    )}
                    <span className='px-1 py-0.5 rounded-full text-xs bg-gray-100'>
                        {entry.codon.begin}-{entry.codon.end}
                    </span>
                    {entry.gapsTrailing.end > entry.gapsTrailing.begin && (
                        <div>
                            :
                            <span className='line-through'>
                                {entry.gapsTrailing.begin}-{entry.gapsTrailing.end}
                            </span>
                        </div>
                    )}{' '}
                    (nt:
                    {entry.nucAbs.map((nucAbs) => (
                        <span className='px-1 py-0.5 rounded-full text-xs bg-gray-100'>
                            {nucAbs.begin}-{nucAbs.end}
                        </span>
                    ))}
                    )
                </div>
            ))}
        </div>
    );
};

export default FrameshiftDisplay;
