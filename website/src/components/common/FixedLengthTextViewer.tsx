import { type FC, useMemo, useEffect, useRef } from 'react';

import { splitString } from '../../utils/splitLines.ts';

type FixedLengthTextViewerProps = {
    text: string;
    maxLineLength: number;
    header?: string;
};

export const FixedLengthTextViewer: FC<FixedLengthTextViewerProps> = ({ text, maxLineLength, header }) => {
    const textArea = useRef<HTMLTextAreaElement>(null);
    const lineNumbersArea = useRef<HTMLTextAreaElement>(null);
    const { formattedText, lineNumbers } = useMemo(() => {
        const lines = splitString(text, maxLineLength);
        const lineNumbering = [];

        for (let i = 0; i <= lines.length - 1; i++) {
            lineNumbering.push(i * maxLineLength + 1);
        }
        if (header !== undefined) {
            lines.unshift(header);
            lineNumbering.unshift('');
        }
        const formattedText = lines.join('\n');
        const lineNumbers = lineNumbering.join('\n');
        return { formattedText, lineNumbers };
    }, [text, maxLineLength, header]);

    useEffect(() => {
        // if textArea is null return
        if (textArea.current === null || lineNumbersArea.current === null) {
            return;
        }
        // set height to scrollHeight
        textArea.current.style.height = `${textArea.current.scrollHeight + 4}px`;

        lineNumbersArea.current.style.height = `${textArea.current.scrollHeight + 4}px`;
    }, [formattedText]);

    const lineSpacing = 'leading-6';

    return (
        <div className='flex'>
            <textarea
                readOnly
                value={lineNumbers}
                className={`flex-none w-16 h-full text-right text-gray-500 border-none  resize-none select-none  border-r border-gray-100  ${lineSpacing} p-0 font-mono `}
                style={{ pointerEvents: 'none' }}
                ref={lineNumbersArea}
            />
            <textarea
                readOnly
                value={formattedText}
                className={`font-mono  resize-none select-none h-content flex-grow whitespace-pre bg-transparent border-0 focus:outline-none focus:ring-0 ${lineSpacing} p-0 pl-3 text-gray-800`}
                ref={textArea}
            />
        </div>
    );
};
