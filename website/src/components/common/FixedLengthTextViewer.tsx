import { type FC, useMemo } from 'react';

import { splitString } from '../../utils/splitLines.ts';

type FixedLengthTextViewerPros = {
    text: string;
    maxLineLength: number;
};

export const FixedLengthTextViewer: FC<FixedLengthTextViewerPros> = ({ text, maxLineLength }) => {
    const lines = useMemo(() => splitString(text, maxLineLength), [text, maxLineLength]);

    return (
        <div className='overflow-x-auto'>
            {lines.map((line, index) => (
                <pre
                    key={index}
                    className='inline-block before:content-[attr(data-line)] before:inline-block before:w-12
                    before:mr-2 before:text-right before:text-gray-500'
                    data-line={index * maxLineLength}
                >
                    <code>{line}</code>
                </pre>
            ))}
        </div>
    );
};
