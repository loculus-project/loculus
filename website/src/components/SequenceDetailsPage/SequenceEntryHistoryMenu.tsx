import React from 'react';

import { routes } from '../../routes/routes';
import { type SequenceEntryHistory } from '../../types/lapis';
import { getVersionStatusColor, getVersionStatusLabel } from '../../utils/getVersionStatusColor';
import { DropdownMenu, DropdownMenuItem } from '../common/DropdownMenu';
import { buttonClasses } from '../common/buttonStyles';
import IcBaselineHistory from '~icons/ic/baseline-history';
import Arrow from '~icons/ic/sharp-keyboard-arrow-down';

interface Props {
    sequenceEntryHistory: SequenceEntryHistory;
    accessionVersion: string;
    handleSelect?: (accessionVersion: string) => void;
}

export const SequenceEntryHistoryMenu: React.FC<Props> = ({ sequenceEntryHistory, accessionVersion, handleSelect }) => {
    const selectedVersion = sequenceEntryHistory.find((version) => version.accessionVersion === accessionVersion);
    return (
        <>
            <DropdownMenu
                className='hidden sm:inline-block mr-2'
                panelClassName='top-full -right-32 text-sm w-80'
                trigger={
                    <label
                        tabIndex={0}
                        // Kept black (rather than the primary `outline` variant) to match the
                        // dark control icons it sits next to in SeqPreviewModal.
                        className={buttonClasses({
                            size: 'sm',
                            variant: 'unstyled',
                            className:
                                'py-1 bg-transparent border-base-content text-base-content hover:bg-base-content hover:text-base-100',
                        })}
                    >
                        <span className='text-sm'>
                            {selectedVersion === undefined ? 'All versions' : `Version ${selectedVersion.version}`}
                        </span>
                        <Arrow />
                    </label>
                }
            >
                {sequenceEntryHistory.map((version) => {
                    const isSelected = accessionVersion === version.accessionVersion;
                    return (
                        <DropdownMenuItem
                            key={version.accessionVersion}
                            href={routes.sequenceEntryDetailsPage(version.accessionVersion)}
                            onClick={(e) => {
                                if (handleSelect) {
                                    handleSelect(version.accessionVersion);
                                    e.preventDefault();
                                }
                            }}
                        >
                            <span className={isSelected ? 'font-semibold' : ''}>{version.accessionVersion}</span>
                            <p className={`${getVersionStatusColor(version.versionStatus, version.isRevocation)} ml-2`}>
                                {getVersionStatusLabel(version.versionStatus, version.isRevocation)}
                            </p>
                        </DropdownMenuItem>
                    );
                })}
                <DropdownMenuItem
                    href={routes.sequenceEntryVersionsPage(accessionVersion)}
                    className='border-t border-base-300 mt-1 pt-2 rounded-none'
                >
                    Compare versions
                </DropdownMenuItem>
            </DropdownMenu>
            <div className='sm:hidden inline-block mr-2'>
                <a href={routes.sequenceEntryVersionsPage(accessionVersion)} className='text-xl'>
                    <IcBaselineHistory />
                </a>
            </div>
        </>
    );
};
