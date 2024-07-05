import { Dialog, Transition, DialogPanel, DialogTitle } from '@headlessui/react';
import React, { Fragment } from 'react';

import { type ReferenceAccession } from '../../types/referencesGenomes';
import X from '~icons/material-symbols/close';
import MaterialSymbolsHelpOutline from '~icons/material-symbols/help-outline';

export const ReferenceLink = ({ accession }: { accession: string }) => {
    return (
        <a
            href={'https://www.ncbi.nlm.nih.gov/nuccore/__value__'.replace('__value__', accession.toString())}
            target='_blank'
            className='underline  hover:text-primary-500'
        >
            {accession}
        </a>
    );
};

interface Props {
    reference: ReferenceAccession[];
}

const ReferenceSequenceLinkButton: React.FC<Props> = ({ reference }) => {
    const [isOpen, setIsOpen] = React.useState(false);

    const openDialog = () => setIsOpen(true);
    const closeDialog = () => setIsOpen(false);

    return (
        <>
            <button onClick={openDialog} className='text-gray-400 hover:text-primary-600 '>
                <MaterialSymbolsHelpOutline className='inline-block h-6 w-5' />
            </button>
            <Transition appear show={isOpen} as={Fragment}>
                <Dialog as='div' className='relative z-10' onClose={closeDialog}>
                    <Transition.Child
                        as={Fragment}
                        enter='ease-out duration-300'
                        enterFrom='opacity-0'
                        enterTo='opacity-100'
                        leave='ease-in duration-200'
                        leaveFrom='opacity-100'
                        leaveTo='opacity-0'
                    >
                        <div className='fixed inset-0 bg-black bg-opacity-25' />
                    </Transition.Child>

                    <div className='fixed inset-0 overflow-y-auto'>
                        <div className='flex min-h-full items-center justify-center p-4 text-center'>
                            <Transition.Child
                                as={Fragment}
                                enter='ease-out duration-300'
                                enterFrom='opacity-0 scale-95'
                                enterTo='opacity-100 scale-100'
                                leave='ease-in duration-200'
                                leaveFrom='opacity-100 scale-100'
                                leaveTo='opacity-0 scale-95'
                            >
                                <DialogPanel className='w-full max-w-5xl transform overflow-hidden rounded-2xl bg-white p-6 text-left align-middle shadow-xl transition-all'>
                                    <DialogTitle as='h3' className='font-bold text-2xl mb-4 text-primary-700'>
                                        Reference Sequence
                                    </DialogTitle>
                                    <button className='absolute right-2 top-2 p-1' onClick={closeDialog}>
                                        <X className='h-6 w-6' />
                                    </button>
                                    <div className='mt-4'>
                                        {reference.filter((item) => item.insdc_accession_full !== undefined).length >
                                            0 && (
                                            <div>
                                                <div>
                                                    Alignment and Mutation metrics use the INSDC reference sequence(s):{' '}
                                                </div>
                                                <span>
                                                    {reference.map(
                                                        (currElement, index) =>
                                                            currElement.insdc_accession_full !== undefined && (
                                                                <div key={index} className='text-primary-700'>
                                                                    {currElement.name}:{' '}
                                                                    <ReferenceLink
                                                                        accession={currElement.insdc_accession_full}
                                                                    />
                                                                    {index + 1 !== reference.length ? ', ' : ''}
                                                                </div>
                                                            ),
                                                    )}
                                                </span>
                                            </div>
                                        )}
                                    </div>
                                </DialogPanel>
                            </Transition.Child>
                        </div>
                    </div>
                </Dialog>
            </Transition>
        </>
    );
};

export default ReferenceSequenceLinkButton;
