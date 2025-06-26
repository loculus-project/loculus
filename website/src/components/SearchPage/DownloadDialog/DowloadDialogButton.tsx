import type { FC } from 'react';

import { type SequenceFilter } from './SequenceFilters';
import { formatNumberWithDefaultLocale } from '../../../utils/formatNumber';
import MaterialSymbolsLightDownload from '~icons/material-symbols-light/download';

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
    let buttonWidthClass = ''; // fix the width so we don't get layout shifts with changing number of selected entries
    const sequenceCount = sequenceFilter.sequenceCount();
    if (sequenceCount === undefined) {
        buttonText = 'Download all entries';
        buttonWidthClass = 'w-48';
    } else {
        const formattedCount = formatNumberWithDefaultLocale(sequenceCount);
        const entries = sequenceCount === 1 ? 'entry' : 'entries';
        buttonText = `Download ${formattedCount} selected ${entries}`;
        buttonWidthClass = 'w-[16rem]'; // expanded width to accommodate icon
    }
    return (
        <button className={buttonWidthClass + ' outlineButton flex items-center justify-center'} onClick={onClick}>
            <MaterialSymbolsLightDownload className='h-5 w-5 mr-1' aria-hidden='true' />
            {buttonText}
        </button>
    );
};
