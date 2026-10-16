import { type FC } from 'react';

import useClientFlag from '../../hooks/isClient';
import { routes } from '../../routes/routes';
import { useRestrictedUseDownloadConfirmation } from '../common/RestrictedUseDownloadDialog';
import IcBaselineDownload from '~icons/ic/baseline-download';
import IwwaArrowDown from '~icons/iwwa/arrow-down';

type Props = {
    accessionVersion: string;
    showFastaDownloadButton: boolean;
    isRestricted: boolean;
};

export const SequenceDownloadMenu: FC<Props> = ({ accessionVersion, showFastaDownloadButton, isRestricted }) => {
    const isClient = useClientFlag();
    const { onDownloadLinkClick, confirmationDialog } = useRestrictedUseDownloadConfirmation(isRestricted);

    // Restricted downloads need the confirmation dialog, so keep them unclickable until hydration completes.
    const itemClassName = `block px-4 py-2 outlineButtonDropdownItem ${isRestricted && !isClient ? 'pointer-events-none cursor-wait' : ''}`;

    return (
        <div className='inline-block relative group'>
            <label
                tabIndex={0}
                className='hidden sm:block py-1 text-primary-700 cursor-pointer'
                data-testid='metadata-download-dropdown'
            >
                Download
                <span className='text-primary'>
                    {' '}
                    <IwwaArrowDown className='inline-block -mt-1 ml-1 h-4 w-4' />
                </span>
            </label>
            <span tabIndex={0} className='sm:hidden inline text-xl cursor-pointer'>
                <IcBaselineDownload />
            </span>
            <ul className='invisible absolute z-20 opacity-0 transition-opacity duration-150 group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100 flex flex-col gap-px bg-base-100 rounded-lg shadow-sm p-1 top-full -left-44 sm:-left-24 w-52'>
                {showFastaDownloadButton && (
                    <li>
                        <a
                            href={routes.sequenceEntryFastaPage(accessionVersion, true)}
                            className={itemClassName}
                            onClick={onDownloadLinkClick}
                        >
                            Download FASTA
                        </a>
                    </li>
                )}
                <li>
                    <a
                        href={routes.sequenceEntryTsvPage(accessionVersion, true)}
                        className={itemClassName}
                        onClick={onDownloadLinkClick}
                    >
                        Download metadata TSV
                    </a>
                </li>
            </ul>
            {confirmationDialog}
        </div>
    );
};
