import { Dialog, DialogPanel, Transition } from '@headlessui/react';
import React, { useEffect, useState } from 'react';

import { getClientLogger } from '../../clientLogger.ts';
import { routes } from '../../routes/routes';
import { type Group } from '../../types/backend';
import type { SequenceFlaggingConfig } from '../../types/config.ts';
import { type DetailsJson, detailsJsonSchema } from '../../types/detailsJson.ts';
import { type ReferenceGenomesMap } from '../../types/referencesGenomes';
import { SequenceDataUI } from '../SequenceDetailsPage/SequenceDataUI';
import { SequenceEntryHistoryMenu } from '../SequenceDetailsPage/SequenceEntryHistoryMenu';
import SequencesBanner from '../SequenceDetailsPage/SequencesBanner.tsx';
import { Button } from '../common/Button';
import CharmMenuKebab from '~icons/charm/menu-kebab';
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
    referenceGenomesMap: ReferenceGenomesMap;
    sequenceFlaggingConfig: SequenceFlaggingConfig | undefined;
    myGroups: Group[];
    isHalfScreen?: boolean;
    setIsHalfScreen: (isHalfScreen: boolean) => void;
    setPreviewedSeqId?: (seqId: string | null) => void;
}

const logger = getClientLogger('SeqPreviewModal');

export const SeqPreviewModal: React.FC<SeqPreviewModalProps> = ({
    seqId,
    accessToken,
    isOpen,
    onClose,
    referenceGenomesMap,
    sequenceFlaggingConfig,
    myGroups,
    isHalfScreen = false,
    setIsHalfScreen,
    setPreviewedSeqId,
}) => {
    const [isLoading, setIsLoading] = useState(true);
    const [data, setData] = useState<DetailsJson | null>(null);
    const [isError, setIsError] = useState(false);

    useEffect(() => {
        if (seqId) {
            setIsLoading(true);
            void fetch(`/seq/${seqId}/details.json`)
                .then((res) => res.json())
                .then((json) => {
                    try {
                        return detailsJsonSchema.parse(json);
                    } catch (e) {
                        void logger.error(`Failed to parse JSON: ${e}`);
                        throw e;
                    }
                })
                .then(setData)
                .catch(() => setIsError(true))
                .finally(() => setIsLoading(false));
        }
    }, [accessToken, seqId]);

    const content = (
        <div
            className={`mt-4 text-gray-700 overflow-y-auto ${isHalfScreen ? 'h-[calc(50vh-9rem)]' : 'h-[calc(100vh-9rem)]'}`}
        >
            {!isLoading && data !== null && (
                <SequencesBanner
                    sequenceEntryHistory={data.sequenceEntryHistory}
                    accessionVersion={data.accessionVersion}
                />
            )}

            {isLoading ? (
                <div>Loading...</div>
            ) : data !== null && !isError ? (
                <div className='px-6'>
                    <SequenceDataUI
                        {...data}
                        referenceGenomeSequenceNames={referenceGenomesMap}
                        myGroups={myGroups}
                        accessToken={accessToken}
                        sequenceFlaggingConfig={data.isRevocation ? undefined : sequenceFlaggingConfig}
                    />
                </div>
            ) : (
                <div>Failed to load sequence data</div>
            )}
        </div>
    );

    const controls = (
        <div className='flex justify-between items-center'>
            <div className='text-xl font-medium leading-6 text-primary-700 pl-6'>{seqId}</div>
            <div className='flex items-center'>
                {data !== null && data.sequenceEntryHistory.length > 1 && (
                    <SequenceEntryHistoryMenu
                        sequenceEntryHistory={data.sequenceEntryHistory}
                        accessionVersion={seqId}
                        setPreviewedSeqId={setPreviewedSeqId}
                    />
                )}
                <Button
                    type='button'
                    className={BUTTONCLASS}
                    onClick={() => setIsHalfScreen(!isHalfScreen)}
                    title={isHalfScreen ? 'Expand sequence details view' : 'Dock sequence details view'}
                    data-testid='toggle-half-screen-button'
                >
                    {isHalfScreen ? (
                        <MaterialSymbolsLightWidthFull className='w-6 h-6' />
                    ) : (
                        <MdiDockBottom className='w-6 h-6' />
                    )}
                </Button>
                <DownloadButton seqId={seqId} />
                <a href={routes.sequenceEntryDetailsPage(seqId)} title='Open in full window' className={BUTTONCLASS}>
                    <OouiNewWindowLtr className='w-6 h-6' />
                </a>
                <Button
                    type='button'
                    className={BUTTONCLASS}
                    onClick={onClose}
                    title='Close'
                    data-testid='close-preview-button'
                >
                    <MaterialSymbolsClose className='w-6 h-6' />
                </Button>
            </div>
        </div>
    );

    return (
        <Transition appear show={isOpen} as={React.Fragment}>
            {isHalfScreen ? (
                <div
                    className='fixed bottom-0 w-full left-0 z-40 bg-white p-6 border-t border-gray-400'
                    data-testid='half-screen-preview'
                >
                    {controls}
                    {content}
                </div>
            ) : (
                <Dialog
                    as='div'
                    className='fixed inset-0 z-40 overflow-y-auto'
                    onClose={onClose}
                    data-testid='sequence-preview-modal'
                >
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

interface DownloadButtonProps {
    seqId: string;
}

const DownloadButton: React.FC<DownloadButtonProps> = ({ seqId }: { seqId: string }) => {
    return (
        <div className='dropdown dropdown-hover relative inline-block'>
            <Button className={BUTTONCLASS}>
                <IcBaselineDownload className='w-6 h-6' />

                <CharmMenuKebab className=' w-4 h-6 -ml-1.5 pb-1 pt-1.5' />
            </Button>
            <ul className='dropdown-content z-20 menu p-1 shadow bg-base-100 rounded-btn absolute top-full w-52 -left-32'>
                <li>
                    <a href={routes.sequenceEntryFastaPage(seqId, true)} className='block px-4 py-2 hover:bg-gray-100'>
                        Download FASTA
                    </a>
                </li>
                <li>
                    <a href={routes.sequenceEntryTsvPage(seqId, true)} className='block px-4 py-2 hover:bg-gray-100'>
                        Download metadata TSV
                    </a>
                </li>
            </ul>
        </div>
    );
};
