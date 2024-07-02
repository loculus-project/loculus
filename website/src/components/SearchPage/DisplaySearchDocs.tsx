import { type FC, useRef } from 'react';

const DisplaySearchDocs: FC = () => {
    const dialogRef = useRef<HTMLDialogElement>(null);

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
                ?
            </button>
            <dialog ref={dialogRef} className='modal'>
                <button
                    className='btn btn-sm btn-circle btn-ghost text-gray-900 absolute right-2 top-2'
                    onClick={closeDialog}
                >
                    ✕
                </button>
                <div className='modal-box max-w-5xl'>
                    <form method='dialog'>
                        <button className='btn btn-sm btn-circle btn-ghost absolute right-2 top-2'>✕</button>
                    </form>
                    <h3 className='font-bold text-2xl mb-4 text-primary-700'>Mutation Search</h3>
                    <div className='mb-4'>
                        <h4 className='font-bold text-l mb-4'>Nucleotide Mutations and Insertions</h4>
                        <p>
                            A nucleotide mutation has the format <b>&lt;position&gt;&lt;base&gt;</b> or
                            <b>&lt;base_ref&gt;&lt;position&gt;&lt;base&gt;. A &lt;base&gt;</b> can be one of the four
                            nucleotides <b>A</b>, <b>T</b>, <b>C</b>, and <b>G</b>. It can also be <b>-</b> for deletion
                            and <b>N</b> for unknown. For example if the reference sequence is <b>A</b> at position{' '}
                            <b>23</b> both: <b>23T</b> and <b>A23T</b> will yield the same results.
                        </p>
                        <p>
                            If your organism is multi-segmented you must append the name of the segment to the start of
                            the mutation, e.g. <b>S:23T</b> and <b>S:A23T</b> for a mutation in segment <b>S</b>.
                        </p>
                        <p>
                            Insertions can be searched for in the same manner, they just need to have <b>ins_</b>{' '}
                            appended to the start of the mutation. Example <b>ins_10462:A</b> or if the organism is
                            multi-segmented <b>ins_S:10462:A</b>.
                        </p>
                    </div>

                    <div className='mb-4'>
                        <h4 className='font-bold text-l mb-4'>Amino Acid Mutations and Insertions</h4>
                        <p>
                            An amino acid mutation has the format <b>&lt;gene&gt;:&lt;position&gt;&lt;base&gt;</b> or
                            <b>&lt;gene&gt;:&lt;base_ref&gt;&lt;position&gt;&lt;base&gt;</b>. A <b>&lt;base&gt;</b> can
                            be one of the 20 amino acid codes. It can also be <b>-</b> for deletion and <b>X</b> for
                            unknown. Example: <b>E:57Q</b>.
                        </p>
                        <p>
                            Insertions can be searched for in the same manner, they just need to have <b>ins_ </b>
                            appended to the start of the mutation. Example <b>ins_NS4B:31:N</b>.
                        </p>

                        <p>
                            Multiple mutation filters can be provided in a single request. They can either be added one
                            after another or all at once in a comma separated list. Example: <b>123T,E:57Q</b>.
                        </p>
                    </div>

                    <div className='mb-4'>
                        <h4 className='font-bold text-l mb-4'>Any Mutation</h4>
                        <p>
                            To filter for any mutation at a given position you can omit the <b>&lt;base&gt;</b>.
                        </p>
                    </div>
                    <div className='mb-4'>
                        <h4 className='font-bold text-l mb-4'>No Mutation</h4>
                        <p>
                            You can write a <b>.</b> for the <b>&lt;base&gt;</b> to filter for sequences for which it is
                            confirmed that no mutation occurred, i.e. has the same base as the reference genome at the
                            specified position.
                        </p>
                    </div>
                </div>
            </dialog>
        </>
    );
};

export default DisplaySearchDocs;
