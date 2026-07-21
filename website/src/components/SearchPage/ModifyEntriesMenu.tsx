import { Menu, MenuButton, MenuItem, MenuItems } from '@headlessui/react';
import { type FC, useState } from 'react';

import { type SequenceFilter } from './DownloadDialog/SequenceFilters';
import { useSubmittedDataDownload } from './DownloadDialog/useSubmittedDataDownload';
import type { ClientConfig } from '../../types/runtimeConfig';
import { formatNumberWithDefaultLocale } from '../../utils/formatNumber';
import { EditDataUseTermsModal, editDataUseTermsLabel } from '../DataUseTerms/EditDataUseTermsModal';
import { Button } from '../common/Button';
import { HoverTooltip } from '../common/HoverTooltip';
import { buttonClasses } from '../common/buttonStyles';
import IwwaArrowDown from '~icons/iwwa/arrow-down';
import PajamasAdmin from '~icons/pajamas/admin';

type ModifyEntriesMenuProps = {
    sequenceFilter: SequenceFilter;
    clientConfig: ClientConfig;
    lapisUrl: string;
    accessToken?: string;
    /** Data use terms are only editable by a group's own members, on their released sequences. */
    showEditDataUseTerms: boolean;
    /** Undefined unless we are on a group's released sequences page and can identify the group. */
    submittedDataDownload?: {
        backendUrl: string;
        organism: string;
        groupId: number;
        totalSequences?: number;
        fetchAccessions: () => Promise<string[]>;
    };
};

const itemClasses = (focus: boolean) =>
    `${focus ? 'bg-gray-100 text-gray-900' : 'text-gray-700'} block px-4 py-2 text-sm w-full text-left`;

/** Reads as its neighbouring download button does, so the two describe their scope alike. */
const menuButtonLabel = (sequenceFilter: SequenceFilter): string => {
    const sequenceCount = sequenceFilter.sequenceCount();
    if (sequenceCount === undefined) {
        return 'Modify all entries';
    }
    const formattedCount = formatNumberWithDefaultLocale(sequenceCount);
    return `Modify ${formattedCount} selected ${sequenceCount === 1 ? 'entry' : 'entries'}`;
};

/**
 * The ways of altering entries you have already released, gathered behind one button rather than
 * spread across the action row: each is long-labelled, rarely used, and only shown to a group's
 * own members, so they crowd out the controls everyone needs.
 */
export const ModifyEntriesMenu: FC<ModifyEntriesMenuProps> = ({
    sequenceFilter,
    clientConfig,
    lapisUrl,
    accessToken,
    showEditDataUseTerms,
    submittedDataDownload,
}) => {
    const [isDataUseTermsOpen, setIsDataUseTermsOpen] = useState(false);

    return (
        <>
            <Menu as='div' className='relative inline-block text-left'>
                <MenuButton
                    className={buttonClasses({
                        variant: 'outline',
                        // A floor rather than a fixed width, so the button does not jump about as
                        // the number of selected entries changes but can still hold a long count.
                        className: 'flex items-center justify-between whitespace-nowrap min-w-44',
                    })}
                >
                    <span className='flex items-center'>
                        <PajamasAdmin className='mr-2 h-4 w-4 shrink-0' aria-hidden='true' />
                        {menuButtonLabel(sequenceFilter)}
                    </span>
                    <IwwaArrowDown className='ml-2 h-5 w-5' aria-hidden='true' />
                </MenuButton>

                <MenuItems className='absolute right-0 mt-2 w-72 origin-top-right rounded-md bg-white shadow-lg ring-1 ring-black/5 focus:outline-hidden z-20'>
                    <div className='py-1'>
                        {showEditDataUseTerms && (
                            <MenuItem>
                                {({ focus }) => (
                                    <Button className={itemClasses(focus)} onClick={() => setIsDataUseTermsOpen(true)}>
                                        {editDataUseTermsLabel(sequenceFilter)}
                                    </Button>
                                )}
                            </MenuItem>
                        )}
                        {submittedDataDownload !== undefined && accessToken !== undefined && (
                            <SubmittedDataDownloadItem
                                sequenceFilter={sequenceFilter}
                                accessToken={accessToken}
                                {...submittedDataDownload}
                            />
                        )}
                    </div>
                </MenuItems>
            </Menu>
            {showEditDataUseTerms && (
                <EditDataUseTermsModal
                    lapisUrl={lapisUrl}
                    clientConfig={clientConfig}
                    accessToken={accessToken}
                    sequenceFilter={sequenceFilter}
                    isOpen={isDataUseTermsOpen}
                    onClose={() => setIsDataUseTermsOpen(false)}
                />
            )}
        </>
    );
};

type SubmittedDataDownloadItemProps = {
    sequenceFilter: SequenceFilter;
    backendUrl: string;
    accessToken: string;
    organism: string;
    groupId: number;
    totalSequences?: number;
    fetchAccessions: () => Promise<string[]>;
};

const SubmittedDataDownloadItem: FC<SubmittedDataDownloadItemProps> = (props) => {
    const { label, isDownloading, exceedsLimit, limitMessage, download } = useSubmittedDataDownload(props);

    const item = (
        <MenuItem disabled={isDownloading || exceedsLimit}>
            {({ focus }) => (
                <Button
                    className={`${itemClasses(focus)} ${exceedsLimit ? 'text-gray-400' : ''}`}
                    onClick={download}
                    disabled={isDownloading || exceedsLimit}
                >
                    {isDownloading ? 'Downloading...' : label}
                </Button>
            )}
        </MenuItem>
    );

    // The tooltip goes on a wrapper rather than the item: a disabled button is
    // `pointer-events-none`, so it never sees the hover that would explain why.
    return exceedsLimit ? (
        <HoverTooltip content={limitMessage} place='left'>
            {item}
        </HoverTooltip>
    ) : (
        item
    );
};
