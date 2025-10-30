import { Dialog, Transition, TransitionChild, DialogPanel, DialogTitle } from '@headlessui/react';
import React, { Fragment } from 'react';

import { type ReferenceAccession } from '../../types/referencesGenomes';
import { Button } from '../common/Button';
import X from '~icons/material-symbols/close';
import MaterialSymbolsInfoOutline from '~icons/material-symbols/info-outline';

export const ReferenceLink = ({ accession }: { accession: string }) => {
    return (
        <a
            href={'https://www.ncbi.nlm.nih.gov/nuccore/__value__'.replace('__value__', accession)}
            target='_blank'
            className='underline text-primary-600 hover:text-primary-500'
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

    const isMultiSegmented = reference.length > 1;

    return (
        <>
            <Button onClick={openDialog} className='text-gray-400 hover:text-primary-600 '>
                <MaterialSymbolsInfoOutline className='inline-block h-6 w-5' />
            </Button>
            <Transition appear show={isOpen} as={Fragment}>
                <Dialog as='div' className='relative z-40' onClose={closeDialog}>
                    <TransitionChild
                        as={Fragment}
                        enter='ease-out duration-300'
                        enterFrom='opacity-0'
                        enterTo='opacity-100'
                        leave='ease-in duration-200'
                        leaveFrom='opacity-100'
                        leaveTo='opacity-0'
                    >
                        <div className='fixed inset-0 bg-black bg-opacity-25' />
                    </TransitionChild>

                    <div className='fixed inset-0 overflow-y-auto'>
                        <div className='flex min-h-full items-center justify-center p-4 text-center'>
                            <TransitionChild
                                as={Fragment}
                                enter='ease-out duration-300'
                                enterFrom='opacity-0 scale-95'
                                enterTo='opacity-100 scale-100'
                                leave='ease-in duration-200'
                                leaveFrom='opacity-100 scale-100'
                                leaveTo='opacity-0 scale-95'
                            >
                                <DialogPanel className='w-full max-w-2xl transform overflow-hidden rounded-2xl bg-white p-6 text-left align-middle shadow-xl transition-all'>
                                    <DialogTitle as='h3' className='font-bold text-2xl mb-4 text-primary-700'>
                                        Reference sequence
                                    </DialogTitle>
                                    <Button className='absolute right-2 top-2 p-1' onClick={closeDialog}>
                                        <X className='h-6 w-6' />
                                    </Button>
                                    <div className='mt-4'>
                                        {reference.filter((item) => item.insdcAccessionFull !== undefined).length >
                                            0 && (
                                            <div>
                                                <div>
                                                    Alignment and Mutation metrics use the following INSDC reference
                                                    sequence
                                                    {reference.length > 1 ? 's: ' : ': '}
                                                </div>
                                                <table className='ml-5 mt-2'>
                                                    <tbody>
                                                        {reference.map(
                                                            (currElement, index) =>
                                                                currElement.insdcAccessionFull !== undefined && (
                                                                    <tr key={index}>
                                                                        {isMultiSegmented && (
                                                                            <td className='px-2 font-medium'>
                                                                                {currElement.name}:
                                                                            </td>
                                                                        )}
                                                                        <td className='px-2'>
                                                                            <ReferenceLink
                                                                                accession={
                                                                                    currElement.insdcAccessionFull
                                                                                }
                                                                            />
                                                                        </td>
                                                                    </tr>
                                                                ),
                                                        )}
                                                    </tbody>
                                                </table>
                                            </div>
                                        )}
                                    </div>
                                </DialogPanel>
                            </TransitionChild>
                        </div>
                    </div>
                </Dialog>
            </Transition>
        </>
    );
};

export default ReferenceSequenceLinkButton;
