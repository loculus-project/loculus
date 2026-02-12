import { Dialog, Transition, TransitionChild, DialogPanel, DialogTitle } from '@headlessui/react';
import React, { Fragment } from 'react';

import type { GeneInfo } from '../../utils/sequenceTypeHelpers';
import { Button } from '../common/Button';
import X from '~icons/material-symbols/close';
import MaterialSymbolsHelpOutline from '~icons/material-symbols/help-outline';

const DisplaySearchDocs: React.FC<{ geneInfos: GeneInfo[] }> = ({ geneInfos }) => {
    const [isOpen, setIsOpen] = React.useState(false);

    const openDialog = () => setIsOpen(true);
    const closeDialog = () => setIsOpen(false);

    return (
        <>
            <Button onClick={openDialog} className='text-gray-400 hover:text-primary-600 '>
                <MaterialSymbolsHelpOutline className='inline-block h-6 w-5' />
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
                                <DialogPanel className='w-full max-w-5xl transform overflow-hidden rounded-2xl bg-white p-6 text-left align-middle shadow-xl transition-all'>
                                    <DialogTitle as='h3' className='font-bold text-2xl mb-4 text-primary-700'>
                                        Mutation search
                                    </DialogTitle>
                                    <Button className='absolute right-2 top-2 p-1' onClick={closeDialog}>
                                        <X className='h-6 w-6' />
                                    </Button>
                                    <div className='mb-4'>
                                        <h4 className='font-bold text-l mb-4 text-primary-700'>
                                            Nucleotide mutations and insertions
                                        </h4>
                                        <p className='mb-2'>
                                            Nucleotide mutations have the format <b>&lt;position&gt;&lt;base&gt;</b> or{' '}
                                            <b>&lt;base_ref&gt;&lt;position&gt;&lt;base&gt;</b>. A <b>&lt;base&gt;</b>{' '}
                                            can be one of the four nucleotides <b>A</b>, <b>T</b>, <b>C</b>, and{' '}
                                            <b>G</b>. It can also be <b>-</b> for deletion and <b>N</b> for unknown. For
                                            example if the reference sequence is <b>A</b> at position <b>23</b> both:{' '}
                                            <b>23T</b> and <b>A23T</b> will yield the same results.
                                        </p>
                                        <p className='mb-2'>
                                            Insertions can be searched for in the same manner, they just need to have{' '}
                                            <b>ins_</b> appended to the start of the mutation. Example{' '}
                                            <b>ins_10462:A</b>.
                                        </p>
                                    </div>

                                    <div className='mb-4'>
                                        <h4 className='font-bold text-l mb-4 text-primary-700'>
                                            Amino acid mutations and insertions
                                        </h4>
                                        <p className='mb-2'>
                                            An amino acid mutation has the format{' '}
                                            <b>&lt;gene&gt;:&lt;position&gt;&lt;base&gt;</b> or{' '}
                                            <b>&lt;gene&gt;:&lt;base_ref&gt;&lt;position&gt;&lt;base&gt;</b>. A{' '}
                                            <b>&lt;base&gt;</b> can be one of the 20 amino acid codes. It can also be{' '}
                                            <b>-</b> for deletion and <b>X</b> for unknown. Example: <b>E:57Q</b>.
                                        </p>
                                        <p className='mb-2'>
                                            Insertions can be searched for in the same manner, they just need to have{' '}
                                            <b>ins_ </b>
                                            appended to the start of the mutation. Example <b>ins_NS4B:31:N</b>.
                                        </p>
                                        <p className='mb-2'>
                                            Valid gene names are: <b>{geneInfos.map((info) => info.name).join(', ')}</b>
                                            .
                                        </p>
                                    </div>

                                    <div className='mb-4'>
                                        <h4 className='font-bold text-l mb-4 text-primary-700'>Insertion wildcards</h4>
                                        <p className='mb-2'>
                                            Loculus supports insertion queries that contain wildcards <b>?</b>. For
                                            example <b>ins_S:214:?EP?</b> will match all cases where gene <b>S</b> has
                                            an insertion of <b>EP</b> between the positions 214 and 215 but also an
                                            insertion of other AAs which include <b>EP</b>, e.g. the insertion{' '}
                                            <b>EPE</b> will also be matched.
                                        </p>
                                        <p className='mb-2'>
                                            You can also use wildcards to match any insertion at a given position. For
                                            example <b>ins_:214:?</b> will match any (but at least one) nucleotide
                                            insertion between the positions 214 and 215.
                                        </p>
                                    </div>

                                    <div className='mb-4'>
                                        <h4 className='font-bold text-l mb-4 text-primary-700'>Multiple mutations</h4>
                                        <p className='mb-2'>
                                            Multiple mutation filters can be provided by adding one mutation after the
                                            other.
                                        </p>
                                    </div>

                                    <div className='mb-4'>
                                        <h4 className='font-bold text-l mb-4 text-primary-700'>Any mutation</h4>
                                        <p className='mb-2'>
                                            To filter for any mutation at a given position you can omit the{' '}
                                            <b>&lt;base&gt;</b>.
                                        </p>
                                    </div>
                                    <div className='mb-4'>
                                        <h4 className='font-bold text-l mb-4 text-primary-700'>No mutation</h4>
                                        <p className='mb-2'>
                                            You can write a <b>.</b> for the <b>&lt;base&gt;</b> to filter for sequences
                                            for which it is confirmed that no mutation occurred, i.e. has the same base
                                            as the reference genome at the specified position.
                                        </p>
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

export default DisplaySearchDocs;
