import type { FC } from 'react';

import { type SequenceFilter } from './SequenceFilters';
import { formatNumberWithDefaultLocale } from '../../../utils/formatNumber';

type DownloadDialogButtonProps = {
    onClick: () => void;
    downloadParams: SequenceFilter;
};

/**
 * The button that is displayed above the table and used to open the dialog.
 * Also shows the number of selected entries, if a selection is made in the table.
 */
export const DownloadDialogButton: FC<DownloadDialogButtonProps> = ({ onClick, downloadParams }) => {
    let buttonText = '';
    let buttonWidthClass = ''; // fix the width so we don't get layout shifts with changing number of selected entries
    const sequenceCount = downloadParams.sequenceCount();
    if (sequenceCount === undefined) {
        buttonText = 'Download all entries';
        buttonWidthClass = 'w-44';
    } else {
        const formattedCount = formatNumberWithDefaultLocale(sequenceCount);
        const entries = sequenceCount === 1 ? 'entry' : 'entries';
        buttonText = `Download ${formattedCount} selected ${entries}`;
        buttonWidthClass = 'w-[15rem]'; // this width is fine for up to two digit numbers
    }
    return (
        <button className={buttonWidthClass + ' outlineButton'} onClick={onClick}>
            {buttonText}
        </button>
    );
};
