import { Dialog, Transition } from '@headlessui/react';
import React, { useEffect, useState } from 'react';

import { routes } from '../../routes/routes';
import { type Group } from '../../types/backend';
import { type ReferenceGenomesSequenceNames } from '../../types/referencesGenomes';
import { SequenceDataUI } from '../SequenceDetailsPage/SequenceDataUI';
import IcBaselineDownload from '~icons/ic/baseline-download';
import MaterialSymbolsClose from '~icons/material-symbols/close';
import OouiNewWindowLtr from '~icons/ooui/new-window-ltr';

const BUTTONCLASS =
    'inline-flex justify-center px-4 py-2 text-sm font-medium text-gray-900 border border-transparent rounded-md hover:bg-blue-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-blue-500';
interface SeqPreviewModalProps {
    seqId: string;
    accessToken?: string;
    isOpen: boolean;
    onClose: () => void;
    referenceGenomeSequenceNames: ReferenceGenomesSequenceNames;
    myGroups: Group[];
}

export const SeqPreviewModal: React.FC<SeqPreviewModalProps> = ({
    seqId,
    accessToken,
    isOpen,
    onClose,
    referenceGenomeSequenceNames,
    myGroups,
}) => {
    const [isLoading, setIsLoading] = useState(true);
    const [data, setData] = useState<any | null>(null);
    const [isError, setIsError] = useState(false);

    useEffect(() => {
        if (seqId) {
            setIsLoading(true);
            void fetch(`/seq/${seqId}/details.json`)
                .then((res) => res.json())
                .then(setData)
                .catch(() => setIsError(true))
                .finally(() => setIsLoading(false));
        }
    }, [accessToken, seqId]);

    return (
        <Transition appear show={isOpen}>
            <Dialog as='div' className='fixed inset-0 z-10 overflow-y-auto' onClose={onClose}>
                <div className='min-h-screen px-8 text-center'>
                    <Dialog.Overlay className='fixed inset-0 bg-black opacity-30' />

                    <div className='inline-block w-full p-6 my-8 overflow-hidden text-left align-middle transition-all transform bg-white shadow-xl rounded-2xl pb-0'>
                        <div className='flex justify-between items-center'>
                            <Dialog.Title as='h3' className='text-xl font-medium leading-6 text-primary-700 pl-6'>
                                {seqId}
                            </Dialog.Title>
                            <div>
                                <button
                                    type='button'
                                    title='Download FASTA'
                                    className={BUTTONCLASS}
                                    onClick={() => {
                                        document.location = routes.sequencesFastaPage(seqId, true);
                                    }}
                                >
                                    <IcBaselineDownload className='w-6 h-6' />
                                </button>
                                <button
                                    title='Open in full window'
                                    type='button'
                                    className={BUTTONCLASS}
                                    onClick={() => {
                                        document.location = routes.sequencesDetailsPage(seqId);
                                    }}
                                >
                                    <OouiNewWindowLtr className='w-6 h-6' />
                                </button>

                                <button type='button' className={BUTTONCLASS} onClick={onClose} title='Close'>
                                    <MaterialSymbolsClose className='w-6 h-6' />
                                </button>
                            </div>
                        </div>

                        <div className='mt-4 text-gray-700 overflow-y-auto h-[calc(100vh-150px)]'>
                            {isLoading ? (
                                <div>Loading...</div>
                            ) : data !== null && !isError ? (
                                <div className=''>
                                    <SequenceDataUI
                                        {...data}
                                        referenceGenomeSequenceNames={referenceGenomeSequenceNames}
                                        myGroups={myGroups}
                                        accessToken={accessToken}
                                    />
                                </div>
                            ) : (
                                <div>Failed to load sequence data</div>
                            )}
                        </div>
                    </div>
                </div>
            </Dialog>
        </Transition>
    );
};
