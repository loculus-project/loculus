import React from 'react';

import { routes } from '../../routes/routes';
import { type SequenceEntryHistory } from '../../types/lapis';
import { getVersionStatusColor, getVersionStatusLabel } from '../../utils/getVersionStatusColor';
import { Button } from '../common/Button';
import { DropdownMenu, DropdownMenuItem } from '../common/DropdownMenu';
import IcBaselineHistory from '~icons/ic/baseline-history';
import Arrow from '~icons/ic/sharp-keyboard-arrow-down';

interface Props {
    sequenceEntryHistory: SequenceEntryHistory;
    accessionVersion: string;
    handleSelect?: (accessionVersion: string) => void;
    handleLink?: (accessionVersion: string) => string;
}

export const SequenceEntryHistoryMenu: React.FC<Props> = ({
    sequenceEntryHistory,
    accessionVersion,
    handleSelect,
    handleLink,
}) => {
    const selectedVersion = sequenceEntryHistory.find((version) => version.accessionVersion === accessionVersion);
    return (
        <>
            <DropdownMenu
                className='hidden sm:inline-block mr-2'
                align='center'
                panelClassName='text-sm w-80'
                trigger={
                    <Button
                        size='sm'
                        variant='unstyled'
                        // Kept black (rather than the primary `outline` variant) to match the
                        // dark control icons it sits next to in SeqPreviewModal.
                        className='py-1 bg-transparent border-base-content text-base-content hover:bg-base-content hover:text-base-100'
                    >
                        <span className='text-sm'>
                            {selectedVersion === undefined ? 'All versions' : `Version ${selectedVersion.version}`}
                        </span>
                        <Arrow />
                    </Button>
                }
            >
                {sequenceEntryHistory.map((version) => {
                    const isSelected = accessionVersion === version.accessionVersion;
                    return (
                        <DropdownMenuItem
                            key={version.accessionVersion}
                            href={
                                handleLink
                                    ? handleLink(version.accessionVersion)
                                    : routes.sequenceEntryDetailsPage(version.accessionVersion)
                            }
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
