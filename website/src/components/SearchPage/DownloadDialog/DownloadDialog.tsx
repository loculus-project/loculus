import { Dialog, DialogPanel, DialogTitle } from '@headlessui/react';
import { type FC, useState } from 'react';

import { ActiveDownloadFilters } from './ActiveDownloadFilters.tsx';
import { DownloadDialogButton } from './DowloadDialogButton.tsx';
import { DownloadButton } from './DownloadButton.tsx';
import { DownloadForm } from './DownloadForm.tsx';
import type { DownloadParameters } from './DownloadParameters.tsx';
import { type DownloadUrlGenerator, type DownloadOption } from './DownloadUrlGenerator.ts';
import { routes } from '../../../routes/routes.ts';
import type { ReferenceGenomesSequenceNames } from '../../../types/referencesGenomes.ts';

type DownloadDialogProps = {
    downloadUrlGenerator: DownloadUrlGenerator;
    downloadParams: DownloadParameters;
    referenceGenomesSequenceNames: ReferenceGenomesSequenceNames;
};

export const DownloadDialog: FC<DownloadDialogProps> = ({
    downloadUrlGenerator,
    downloadParams,
    referenceGenomesSequenceNames,
}) => {
    const [isOpen, setIsOpen] = useState(false);
    const [downloadOption, setDownloadOption] = useState<DownloadOption | undefined>();
    const [agreedToDataUseTerms, setAgreedToDataUseTerms] = useState(false);

    const openDialog = () => setIsOpen(true);
    const closeDialog = () => setIsOpen(false);

    return (
        <>
            <DownloadDialogButton downloadParams={downloadParams} onClick={openDialog} />
            <Dialog open={isOpen} onClose={closeDialog} className='relative z-40'>
                <div className='fixed inset-0 bg-black bg-opacity-25' />
                <div className='fixed inset-0 overflow-y-auto'>
                    <div className='flex min-h-full items-center justify-center p-4 text-center'>
                        <DialogPanel className='w-full max-w-5xl transform overflow-hidden rounded-2xl bg-white p-6 text-left align-middle shadow-xl'>
                            <DialogTitle as='h3' className='text-2xl font-bold leading-6 text-gray-900 mb-4'>
                                Download
                            </DialogTitle>
                            <button
                                className='absolute right-2 top-2 text-gray-400 hover:text-gray-500'
                                onClick={closeDialog}
                            >
                                <span className='sr-only'>Close</span>
                                <svg className='h-6 w-6' fill='none' viewBox='0 0 24 24' stroke='currentColor'>
                                    <path
                                        strokeLinecap='round'
                                        strokeLinejoin='round'
                                        strokeWidth={2}
                                        d='M6 18L18 6M6 6l12 12'
                                    />
                                </svg>
                            </button>
                            <div className='mt-2'>
                                <ActiveDownloadFilters downloadParameters={downloadParams} />
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
                                    downloadParameters={downloadParams}
                                    disabled={!agreedToDataUseTerms}
                                    onClick={closeDialog}
                                />
                            </div>
                        </DialogPanel>
                    </div>
                </div>
            </Dialog>
        </>
    );
};
