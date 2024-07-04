import { type FC, useRef, useState } from 'react';

import { ActiveDownloadFilters } from './ActiveDownloadFilters.tsx';
import { DownloadButton } from './DownloadButton.tsx';
import { DownloadForm } from './DownloadForm.tsx';
import { type DownloadOption } from './generateDownloadUrl.ts';
import { routes } from '../../../routes/routes.ts';
import type { FieldValues } from '../../../types/config.ts';
import type { ReferenceGenomesSequenceNames } from '../../../types/referencesGenomes.ts';

type DownloadDialogProps = {
    lapisSearchParameters: Record<string, any>;
    referenceGenomesSequenceNames: ReferenceGenomesSequenceNames;
    lapisUrl: string;
    hiddenFieldValues: FieldValues;
};

export const DownloadDialog: FC<DownloadDialogProps> = ({
    lapisSearchParameters,
    referenceGenomesSequenceNames,
    lapisUrl,
    hiddenFieldValues,
}) => {
    const dialogRef = useRef<HTMLDialogElement>(null);
    const [downloadOption, setDownloadOption] = useState<DownloadOption | undefined>();
    const [agreedToDataUseTerms, setAgreedToDataUseTerms] = useState(false);

    const openDialog = () => {
        if (dialogRef.current) {
            dialogRef.current.showModal();
        }
    };

    const closeDialog = () => {
        if (dialogRef.current) {
            dialogRef.current.close();
        }
    };

    return (
        <>
            <button className='outlineButton' onClick={openDialog}>
                Download
            </button>

            <dialog ref={dialogRef} className='modal'>
                <div className='modal-box max-w-5xl'>
                    <form method='dialog'>
                        <button className='btn btn-sm btn-circle btn-ghost absolute right-2 top-2'>✕</button>
                    </form>

                    <h3 className='font-bold text-2xl mb-4'>Download</h3>

                    <ActiveDownloadFilters
                        lapisSearchParameters={lapisSearchParameters}
                        hiddenFieldValues={hiddenFieldValues}
                    />
                    <DownloadForm
                        referenceGenomesSequenceNames={referenceGenomesSequenceNames}
                        onChange={setDownloadOption}
                    />

                    <div className='mb-4'>
                        <label className='label justify-start'>
                            <input
                                type='checkbox'
                                name='data-use-terms-agreement'
                                className='checkbox mr-2'
                                checked={agreedToDataUseTerms}
                                onChange={() => setAgreedToDataUseTerms(!agreedToDataUseTerms)}
                            />
                            <span className='label-text'>
                                I agree to the {/* TODO(862) */}
                                <a href={routes.datauseTermsPage()} className='underline' target='_blank'>
                                    data use terms
                                </a>
                                .
                            </span>
                        </label>
                    </div>

                    <DownloadButton
                        disabled={!agreedToDataUseTerms}
                        lapisUrl={lapisUrl}
                        downloadOption={downloadOption}
                        lapisSearchParameters={lapisSearchParameters}
                        onClick={closeDialog}
                    />
                </div>
            </dialog>
        </>
    );
};
