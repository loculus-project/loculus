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
    /*
     * A floor rather than a fixed width: it holds the button steady against layout shifts as the
     * number of selected entries changes, while still letting counts too long for it widen the
     * button instead of wrapping the label.
     *
     * It lifts once its container is narrow, because this is the widest button in the search
     * action row and the floor is what decides how far that row can compress: keeping it would
     * hold the row's minimum at 609px, and the row is asked to stay on one line down to 512px.
     * Layout shifts only matter where there is room to notice them.
     */
    let buttonWidthClass = '';
    const sequenceCount = sequenceFilter.sequenceCount();
    if (sequenceCount === undefined) {
        buttonText = 'Download all entries';
        buttonWidthClass = '@2xl:min-w-44';
    } else {
        const formattedCount = formatNumberWithDefaultLocale(sequenceCount);
        const entries = sequenceCount === 1 ? 'entry' : 'entries';
        buttonText = `Download ${formattedCount} selected ${entries}`;
        buttonWidthClass = '@2xl:min-w-60';
    }
    return (
        <Button variant='outline' className={buttonWidthClass} onClick={onClick}>
            {buttonText}
        </Button>
    );
};
