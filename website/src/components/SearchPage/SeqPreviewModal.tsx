import { Dialog, DialogPanel, Transition } from '@headlessui/react';
import React, { useEffect, useState } from 'react';

import { routes } from '../../routes/routes';
import { type Group } from '../../types/backend';
import { type ReferenceGenomesSequenceNames } from '../../types/referencesGenomes';
import { SequenceDataUI } from '../SequenceDetailsPage/SequenceDataUI';
import { SequenceEntryHistoryMenu } from '../SequenceDetailsPage/SequenceEntryHistoryMenu';
import IcBaselineDownload from '~icons/ic/baseline-download';
import MaterialSymbolsClose from '~icons/material-symbols/close';
import MaterialSymbolsLightWidthFull from '~icons/material-symbols-light/width-full';
import MdiDockBottom from '~icons/mdi/dock-bottom';
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
    isHalfScreen?: boolean;
    setIsHalfScreen: (isHalfScreen: boolean) => void;
    setPreviewedSeqId?: (seqId: string | null) => void;
}

export const SeqPreviewModal: React.FC<SeqPreviewModalProps> = ({
    seqId,
    accessToken,
    isOpen,
    onClose,
    referenceGenomeSequenceNames,
    myGroups,
    isHalfScreen = false,
    setIsHalfScreen,
    setPreviewedSeqId,
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

    const content = (
        <div
            className={`mt-4 text-gray-700 overflow-y-auto ${isHalfScreen ? 'h-[calc(50vh-9rem)]' : 'h-[calc(100vh-9rem)]'}`}
        >
            {data !== null && data.isRevocation === true && (
                <div className='bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative' role='alert'>
                    <strong className='font-bold'>This sequence has been revoked.</strong>
                </div>
            )}

            {isLoading ? (
                <div>Loading...</div>
            ) : data !== null && !isError ? (
                <SequenceDataUI
                    {...data}
                    referenceGenomeSequenceNames={referenceGenomeSequenceNames}
                    myGroups={myGroups}
                    accessToken={accessToken}
                />
            ) : (
                <div>Failed to load sequence data</div>
            )}
        </div>
    );

    const controls = (
        <div className='flex justify-between items-center'>
            <div className='text-xl font-medium leading-6 text-primary-700 pl-6'>{seqId}</div>
            <div>
                {data !== null && data?.sequenceEntryHistory !== undefined && data?.sequenceEntryHistory.length > 1 && (
                    <SequenceEntryHistoryMenu
                        sequenceEntryHistory={data?.sequenceEntryHistory}
                        accessionVersion={seqId}
                        setPreviewedSeqId={setPreviewedSeqId}
                    />
                )}
                <button
                    type='button'
                    className={BUTTONCLASS}
                    onClick={() => setIsHalfScreen(!isHalfScreen)}
                    title={isHalfScreen ? 'Expand sequence details view' : 'Dock sequence details view'}
                >
                    {isHalfScreen ? (
                        <MaterialSymbolsLightWidthFull className='w-6 h-6' />
                    ) : (
                        <MdiDockBottom className='w-6 h-6' />
                    )}
                </button>
                <a href={routes.sequencesFastaPage(seqId, true)} className={BUTTONCLASS}>
                    <IcBaselineDownload className='w-6 h-6' />
                </a>
                <a href={routes.sequencesDetailsPage(seqId)} title='Open in full window' className={BUTTONCLASS}>
                    <OouiNewWindowLtr className='w-6 h-6' />
                </a>
                <button type='button' className={BUTTONCLASS} onClick={onClose} title='Close'>
                    <MaterialSymbolsClose className='w-6 h-6' />
                </button>
            </div>
        </div>
    );

    return (
        <Transition appear show={isOpen} as={React.Fragment}>
            {isHalfScreen ? (
                <div className='fixed bottom-0 w-full left-0 z-40 bg-white p-6 border-t border-gray-400'>
                    {controls}
                    {content}
                </div>
            ) : (
                <Dialog as='div' className='fixed inset-0 z-40 overflow-y-auto' onClose={onClose}>
                    <div className='min-h-screen px-8 text-center'>
                        <div className='fixed inset-0 bg-black opacity-30' />
                        <DialogPanel className='inline-block w-full p-6 my-8 overflow-hidden text-left align-middle transition-all transform bg-white shadow-xl rounded-2xl pb-0'>
                            {controls}
                            {content}
                        </DialogPanel>
                    </div>
                </Dialog>
            )}
        </Transition>
    );
};
