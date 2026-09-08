import type { FC } from 'react';

import { type SequenceFilter } from './SequenceFilters';
import { formatNumberWithDefaultLocale } from '../../../utils/formatNumber';
import { Button } from '../../common/Button';

type DownloadDialogButtonProps = {
    onClick: () => void;
    sequenceFilter: SequenceFilter;
};

/**
 * The button that is displayed above the table and used to open the dialog.
 * Also shows the number of selected entries, if a selection is made in the table.
 */
export const DownloadDialogButton: FC<DownloadDialogButtonProps> = ({ onClick, sequenceFilter }) => {
    let buttonText = '';
    // A floor rather than a fixed width: it holds the button steady against layout shifts as the
    // number of selected entries changes, while still widening for a label too long for it. Fixed,
    // it was narrower than its own text -- "Download all entries" wrapped over two lines at any
    // screen size, and a count of more than two digits did the same.
    let buttonWidthClass = '';
    const sequenceCount = sequenceFilter.sequenceCount();
    if (sequenceCount === undefined) {
        buttonText = 'Download all entries';
        buttonWidthClass = 'min-w-44';
    } else {
        const formattedCount = formatNumberWithDefaultLocale(sequenceCount);
        const entries = sequenceCount === 1 ? 'entry' : 'entries';
        buttonText = `Download ${formattedCount} selected ${entries}`;
        buttonWidthClass = 'min-w-60';
    }
    return (
        <Button variant='outline' className={buttonWidthClass} onClick={onClick}>
            {buttonText}
        </Button>
    );
};
