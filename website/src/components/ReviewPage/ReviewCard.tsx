import type { FC } from 'react';

import {
    awaitingApprovalStatus,
    hasErrorsStatus,
    inProcessingStatus,
    receivedStatus,
    type SequenceEntryStatus,
    type SequenceEntryStatusNames,
} from '../../types/backend.ts';
import Edit from '~icons/bxs/edit';
import Trash from '~icons/bxs/trash';
import Send from '~icons/fa/send';
import Note from '~icons/fluent/note-24-filled';
import QuestionMark from '~icons/fluent/tag-question-mark-24-filled';
import EmptyCircle from '~icons/grommet-icons/empty-circle';
import TickOutline from '~icons/mdi/tick-outline';

type ReviewCardProps = {
    sequenceEntryStatus: SequenceEntryStatus;
    deleteAccessionVersion: () => void;
    approveAccessionVersion: () => void;
    editAccessionVersion: () => void;
};

export const ReviewCard: FC<ReviewCardProps> = ({
    sequenceEntryStatus,
    approveAccessionVersion,
    deleteAccessionVersion,
    editAccessionVersion,
}) => {
    return (
        <div className='p-3 border rounded-md shadow-lg relative transition-all duration-500'>
            <div className='absolute top-3 right-3 '>
                <button
                    className='text-gray-500 hover:text-gray-900 hover:cursor-pointer inline-block mr-2  text-xl'
                    onClick={approveAccessionVersion}
                    title='Release this sequence entry'
                    disabled={sequenceEntryStatus.status !== awaitingApprovalStatus}
                >
                    <Send />
                </button>
                <button
                    className='text-gray-500 hover:text-gray-900 hover:cursor-pointer inline-block  text-xl'
                    title='Edit this sequence entry'
                    onClick={editAccessionVersion}
                    disabled={
                        sequenceEntryStatus.status !== hasErrorsStatus &&
                        sequenceEntryStatus.status !== awaitingApprovalStatus
                    }
                >
                    <Edit />
                </button>
                <button
                    className='text-gray-500 hover:text-gray-900 hover:cursor-pointer inline-block ml-2 text-xl'
                    onClick={deleteAccessionVersion}
                    title='Discard this sequence entry'
                    disabled={
                        sequenceEntryStatus.status !== hasErrorsStatus &&
                        sequenceEntryStatus.status !== awaitingApprovalStatus
                    }
                >
                    <Trash />
                </button>
            </div>
            <div className='flex flex-wrap '>
                <StatusIcon status={sequenceEntryStatus.status} />
                <KeyValueComponent
                    keyName={sequenceEntryStatus.submissionId}
                    value={sequenceEntryStatus.accession}
                    extraStyle='font-medium'
                    keyStyle=' text-gray-600'
                />
            </div>
        </div>
    );
};

const StatusIcon: FC<{ status: SequenceEntryStatusNames }> = ({ status }) => {
    if (status === receivedStatus) {
        return (
            <div className='text-gray-500' title='Awaiting processing'>
                <EmptyCircle />
            </div>
        );
    }
    if (status === hasErrorsStatus) {
        return (
            <div className='text-red-500' title='Error detected'>
                <QuestionMark />
            </div>
        );
    }
    if (status === inProcessingStatus) {
        return (
            <div title='In processing'>
                <span className='loading loading-spinner loading-sm' />
            </div>
        );
    }
    if (status === awaitingApprovalStatus) {
        return (
            // TODO(#702): When queries are implemented, this should be a yellow tick with a warning note if there are warnings
            <div className='text-green-500' title='Passed QC [TODO: sometimes (with warnings)]'>
                <TickOutline />
            </div>
        );
    }
};

type KeyValueComponentProps = {
    keyName: string;
    value: string;
    extraStyle?: string;
    keyStyle?: string;
    warningNote?: boolean;
    errorNote?: boolean;
};

const KeyValueComponent: FC<KeyValueComponentProps> = ({
    keyName,
    value,
    extraStyle,
    keyStyle,
    warningNote,
    errorNote,
}) => {
    return (
        <div className={`flex flex-col m-2 `}>
            <span className={keyStyle !== undefined ? keyStyle : 'text-gray-500 uppercase text-xs'}>{keyName}</span>
            <span className={`text-base ${extraStyle}`}>
                {value}
                {warningNote === true && (
                    <span className='text-yellow-500'>
                        <Note
                            className='inline-block'
                            data-tooltip-content='[Note about what this warning is about]'
                            data-tooltip-id='hi'
                        />
                    </span>
                )}
                {errorNote === true && (
                    <span className='text-red-500'>
                        <Note
                            className='inline-block'
                            data-tooltip-content='[Note about what this error is about]'
                            data-tooltip-id='hi'
                        />
                    </span>
                )}
            </span>
        </div>
    );
};
