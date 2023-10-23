import type { FC } from 'react';

import {
    awaitingApprovalStatus,
    hasErrorsStatus,
    inProcessingStatus,
    receivedStatus,
    type SequenceEntryStatus,
} from '../../types/backend.ts';
import Edit from '~icons/bxs/edit';
import Trash from '~icons/bxs/trash';
import Note from '~icons/fluent/note-24-filled';
import QuestionMark from '~icons/fluent/tag-question-mark-24-filled';
import EmptyCircle from '~icons/grommet-icons/empty-circle';
import Arrow from '~icons/mdi/arrow';
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
                    <Arrow />
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
                {sequenceEntryStatus.status === receivedStatus && (
                    <div className='text-gray-500' title='Sequence was received and will be processed soon'>
                        <EmptyCircle />
                    </div>
                )}
                {sequenceEntryStatus.status === hasErrorsStatus && (
                    <div className='text-red-500' title='Sequence is erroneous and cannot be released.'>
                        <QuestionMark />
                    </div>
                )}
                {sequenceEntryStatus.status === inProcessingStatus && (
                    <div title='Sequence is processed. Please wait.'>
                        <span className='loading loading-spinner loading-sm' />
                    </div>
                )}
                {sequenceEntryStatus.status === awaitingApprovalStatus && (
                    <div className='text-green-500' title='Sequence was processed successfully and can be released.'>
                        <TickOutline />
                    </div>
                )}
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
