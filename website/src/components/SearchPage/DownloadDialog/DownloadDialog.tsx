import { type FC, useMemo, useRef, useState } from 'react';

import { ActiveDownloadFilters } from './ActiveDownloadFilters.tsx';
import { DownloadForm } from './DownloadForm.tsx';
import { type DownloadOption, generateDownloadUrl } from './generateDownloadUrl.ts';
import type { FilterValue, MutationFilter } from '../../../types/config.ts';
import type { ReferenceGenomesSequenceNames } from '../../../types/referencesGenomes.ts';

type DownloadDialogProps = {
    metadataFilter: FilterValue[];
    mutationFilter: MutationFilter;
    referenceGenomesSequenceNames: ReferenceGenomesSequenceNames;
    lapisUrl: string;
};

export const DownloadDialog: FC<DownloadDialogProps> = ({
    metadataFilter,
    mutationFilter,
    referenceGenomesSequenceNames,
    lapisUrl,
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

    const downloadUrl = useMemo(() => {
        if (downloadOption === undefined || !agreedToDataUseTerms) {
            return '#';
        }
        return generateDownloadUrl(metadataFilter, mutationFilter, downloadOption, lapisUrl);
    }, [downloadOption, lapisUrl, metadataFilter, mutationFilter, agreedToDataUseTerms]);

    return (
        <>
            <button className='btn' onClick={openDialog}>
                Download
            </button>

            <dialog ref={dialogRef} className='modal'>
                <div className='modal-box max-w-5xl'>
                    <form method='dialog'>
                        <button className='btn btn-sm btn-circle btn-ghost absolute right-2 top-2'>✕</button>
                    </form>

                    <h3 className='font-bold text-2xl mb-4'>Download</h3>

                    <ActiveDownloadFilters metadataFilter={metadataFilter} mutationFilter={mutationFilter} />
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
                                <a href='#TODO-MVP' className='underline'>
                                    data use terms
                                </a>
                                .
                            </span>
                        </label>
                    </div>

                    <a
                        className={`btn loculusColor ${!agreedToDataUseTerms ? 'btn-disabled' : ''}`}
                        href={downloadUrl}
                        onClick={closeDialog}
                    >
                        Download
                    </a>
                </div>
            </dialog>
        </>
    );
};
