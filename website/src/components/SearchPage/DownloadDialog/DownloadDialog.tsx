import { type FC, useState } from 'react';

import { DownloadDialogButton } from './DowloadDialogButton.tsx';
import { DownloadButton } from './DownloadButton.tsx';
import { DownloadForm } from './DownloadForm.tsx';
import { type DownloadUrlGenerator, type DownloadOption } from './DownloadUrlGenerator.ts';
import type { SequenceFilter } from './SequenceFilters.tsx';
import { routes } from '../../../routes/routes.ts';
import type { ReferenceGenomesSequenceNames } from '../../../types/referencesGenomes.ts';
import { ActiveFilters } from '../../common/ActiveFilters.tsx';
import { BaseDialog } from '../../common/BaseDialog.tsx';

type DownloadDialogProps = {
    downloadUrlGenerator: DownloadUrlGenerator;
    sequenceFilter: SequenceFilter;
    referenceGenomesSequenceNames: ReferenceGenomesSequenceNames;
};

export const DownloadDialog: FC<DownloadDialogProps> = ({
    downloadUrlGenerator,
    sequenceFilter,
    referenceGenomesSequenceNames,
}) => {
    const [isOpen, setIsOpen] = useState(false);

    const openDialog = () => setIsOpen(true);
    const closeDialog = () => setIsOpen(false);

    const [downloadOption, setDownloadOption] = useState<DownloadOption | undefined>();
    const [agreedToDataUseTerms, setAgreedToDataUseTerms] = useState(false);

    return (
        <>
            <DownloadDialogButton sequenceFilter={sequenceFilter} onClick={openDialog} />
            <BaseDialog title='Download' isOpen={isOpen} onClose={closeDialog}>
                <div className='mt-2'>
                    <ActiveFilters sequenceFilter={sequenceFilter} />
                    <DownloadForm
                        referenceGenomesSequenceNames={referenceGenomesSequenceNames}
                        onChange={setDownloadOption}
                    />
                    <div className='mb-4 py-5'>
                        <label className='flex items-center'>
                            <input
                                type='checkbox'
                                name='data-use-terms-agreement'
                                className='mr-3 ml-1 h-5 w-5 rounded border-gray-300 text-black focus:ring-black'
                                checked={agreedToDataUseTerms}
                                onChange={() => setAgreedToDataUseTerms(!agreedToDataUseTerms)}
                            />
                            <span className='text-sm'>
                                I agree to the {/* TODO(862) */}
                                <a
                                    href={routes.datauseTermsPage()}
                                    className='underline'
                                    target='_blank'
                                    rel='noopener noreferrer'
                                >
                                    data use terms
                                </a>
                                .
                            </span>
                        </label>
                    </div>
                    <DownloadButton
                        downloadUrlGenerator={downloadUrlGenerator}
                        downloadOption={downloadOption}
                        sequenceFilter={sequenceFilter}
                        disabled={!agreedToDataUseTerms}
                        onClick={closeDialog}
                    />
                </div>
            </BaseDialog>
        </>
    );
};
