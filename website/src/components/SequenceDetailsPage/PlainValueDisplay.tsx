import React from 'react';

import type { TableDataEntry } from './types';
import { Button } from '../common/Button';

const MAX_PLAIN_STRING_LENGTH = 400;
const SHOW_MORE_LENGTH = 10; // 'Show more' text length

// Preview ends at the last comma or semicolon in the last 50 characters preceding the display limit.
// If there's no comma or semicolon, it will cut off at the last space before the display limit.
// If no space is found, it will cut off at the display limit.
// We reserve 13 characters for the 'Show more' text, so the preview is limited to 387 characters.
const computePreviewString = (value: string): string => {
    const searchStart = MAX_PLAIN_STRING_LENGTH - 50;
    const searchEnd = MAX_PLAIN_STRING_LENGTH - 3 - SHOW_MORE_LENGTH; // 13 chars reserved

    const commaIndex = Math.max(value.lastIndexOf(',', searchEnd), value.lastIndexOf(';', searchEnd));
    if (commaIndex >= searchStart) {
        return value.slice(0, commaIndex + 1).trim();
    }

    const spaceIndex = value.lastIndexOf(' ', searchEnd);
    if (spaceIndex >= searchStart) {
        return value.slice(0, spaceIndex).trim();
    }

    return value.slice(0, searchEnd).trim();
};

export const PlainValueDisplay: React.FC<{ value: TableDataEntry['value'] }> = ({ value }) => {
    const [showMore, setShowMore] = React.useState(false);

    const preview = React.useMemo(() => {
        if (typeof value === 'string' && value.length > MAX_PLAIN_STRING_LENGTH) {
            return computePreviewString(value);
        }
        return null;
    }, [value]);

    if (typeof value === 'boolean') {
        return <span>{value ? 'True' : 'False'}</span>;
    }

    if (preview) {
        return (
            <span>
                {showMore ? value : `${preview}...`}{' '}
                <Button onClick={() => setShowMore(!showMore)} className={`underline${showMore ? ' block' : ''}`}>
                    {showMore ? 'Show less' : 'Show more'}
                </Button>
            </span>
        );
    }

    if (value !== '') {
        return value;
    }

    return <span className='italic'>None</span>;
};
