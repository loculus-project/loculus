import { sentenceCase, snakeCase } from 'change-case';
import { type Result } from 'neverthrow';
import { type FC, Fragment, useMemo, useRef, useState } from 'react';

import { DataRow, ProcessedDataRow } from './DataRow.tsx';
import type { Row, KeyValuePair } from './InputField.tsx';
import { clientFetch, getClientLogger } from '../../api.ts';
import type { ClientConfig, ProcessingAnnotationSourceType, SequenceReview, UnprocessedData } from '../../types.ts';
import { ManagedErrorFeedback } from '../common/ManagedErrorFeedback';

type ReviewPageProps = {
    clientConfig: ClientConfig;
    reviewData: SequenceReview;
    username: string;
};

const logger = getClientLogger('ReviewPage');

export const ReviewPage: FC<ReviewPageProps> = ({ reviewData, clientConfig, username }) => {
    const [editedMetadata, setEditedMetadata] = useState(mapMetadataToRow(reviewData));
    const [editedSequences, setEditedSequences] = useState(mapSequencesToRow(reviewData));

    const [isErrorOpen, setIsErrorOpen] = useState(false);
    const [errorMessage, setErrorMessage] = useState('');

    const dialogRef = useRef<HTMLDialogElement>(null);

    const handleOpenConfirmationDialog = () => {
        if (dialogRef.current) {
            dialogRef.current.showModal();
        }
    };

    const submitReviewForSequenceVersion = async () => {
        const result = await submitReview(reviewData, editedMetadata, editedSequences, username, clientConfig);
        await result.match(
            async () => {
                window.history.back();
                await logger.info('Successfully submitted review ' + reviewData.sequenceId + '.' + reviewData.version);
            },
            async (error) => {
                handleOpenError(`Failed to submit review with error '${JSON.stringify(error)})}'`);
            },
        );
    };
    const handleOpenError = (message: string) => {
        setErrorMessage(message);
        setIsErrorOpen(true);
    };

    const handleCloseError = () => {
        setErrorMessage('');
        setIsErrorOpen(false);
    };

    const processedSequenceRows = useMemo(() => mapProcessedSequencesToRow(reviewData), [reviewData]);
    const processedMetadataRows = useMemo(() => mapProcessedMetadataToRow(reviewData), [reviewData]);

    return (
        <>
            <ManagedErrorFeedback message={errorMessage} open={isErrorOpen} onClose={handleCloseError} />

            <button className='btn normal-case' onClick={handleOpenConfirmationDialog}>
                Submit Review
            </button>

            <dialog ref={dialogRef} className='modal'>
                <div className='modal-box'>
                    <form method='dialog'>
                        <button className='btn btn-sm btn-circle btn-ghost absolute right-2 top-2'>✕</button>
                    </form>

                    <h3 className='font-bold text-lg'>Do you really want to submit?</h3>

                    <div className='flex items-center gap-4 mt-4'>
                        <button className='btn' onClick={submitReviewForSequenceVersion}>
                            Confirm Submission
                        </button>
                        <form method='dialog'>
                            <button className='btn btn-error'>Cancel</button>
                        </form>
                    </div>
                </div>
            </dialog>

            <table className='customTable'>
                <tbody className='w-full'>
                    <Subtitle title='Original Data' bold />
                    <Subtitle title='Metadata' />
                    {editedMetadata.map((field) => (
                        <DataRow
                            key={'raw_metadata' + field.key}
                            customKey={field.key}
                            row={field}
                            editable={(editedRow: Row) =>
                                setEditedMetadata((prevRows: Row[]) =>
                                    prevRows.map((prevRow) =>
                                        prevRow.key === editedRow.key
                                            ? { ...prevRow, value: editedRow.value }
                                            : prevRow,
                                    ),
                                )
                            }
                        />
                    ))}

                    <Subtitle title='Unaligned nucleotide sequences' />
                    {editedSequences.map((field) => (
                        <DataRow
                            key={'raw_unaligned' + field.key}
                            customKey={field.key}
                            row={field}
                            editable={(editedRow: Row) =>
                                setEditedSequences((prevRows: Row[]) =>
                                    prevRows.map((prevRow) =>
                                        prevRow.key === editedRow.key
                                            ? { ...prevRow, value: editedRow.value }
                                            : prevRow,
                                    ),
                                )
                            }
                        />
                    ))}

                    <Subtitle title='Processed Data' bold />
                    <Subtitle title='Metadata' customKey='preprocessing_metadata' />
                    {processedMetadataRows.map((field) => (
                        <ProcessedDataRow
                            key={'processed' + field.key}
                            customKey={'preprocessing_' + field.key}
                            row={field}
                        />
                    ))}
                    {processedSequenceRows.map((sequenceRow) => (
                        <Subtitle
                            key={`preprocessing_sequences_${sequenceRow.type}`}
                            title={sentenceCase(sequenceRow.type)}
                        />
                    ))}
                    {processedSequenceRows.map((sequenceRow) =>
                        sequenceRow.data.map((field) => (
                            <ProcessedDataRow
                                key={`processed_${sequenceRow.type}_${field.key}`}
                                customKey={`preprocessing_${sequenceRow.type}_${field.key}`}
                                row={field}
                            />
                        )),
                    )}
                </tbody>
            </table>
        </>
    );
};

type SubtitleProps = {
    title: string;
    bold?: boolean;
    customKey?: string;
};
const Subtitle: FC<SubtitleProps> = ({ title, bold, customKey }) => (
    <Fragment key={snakeCase(customKey ?? title) + '_fragment'}>
        <tr key={snakeCase(customKey ?? title) + '_spacing'} className='h-4' />
        <tr key={snakeCase(customKey ?? title)}>
            <td className={`${bold ?? false ? 'font-semibold' : 'font-normal'} subtitle`} colSpan={3}>
                {title}
            </td>
        </tr>
    </Fragment>
);

const mapMetadataToRow = (reviewData: SequenceReview): Row[] =>
    Object.entries(reviewData.originalData.metadata).map(([key, value]) => ({
        key,
        initialValue: value.toString(),
        value: value.toString(),
        ...mapErrorsAndWarnings(reviewData, key, 'Metadata'),
    }));

const mapSequencesToRow = (reviewData: SequenceReview): Row[] =>
    Object.entries(reviewData.originalData.unalignedNucleotideSequences).map(([key, value]) => ({
        key,
        initialValue: value.toString(),
        value: value.toString(),
        ...mapErrorsAndWarnings(reviewData, key, 'NucleotideSequence'),
    }));

const mapProcessedMetadataToRow = (reviewData: SequenceReview): KeyValuePair[] =>
    Object.entries(reviewData.processedData.metadata).map(([key, value]) => ({
        key,
        value: value.toString(),
    }));

type SequenceRow = { type: string; data: KeyValuePair[] };

const mapProcessedSequencesToRow = (reviewData: SequenceReview): SequenceRow[] =>
    Object.entries(reviewData.processedData)
        .filter(([sequenceType]) => sequenceType !== 'metadata')
        .map(([sequenceType, sequenceData]) => ({
            type: sequenceType,
            data: Object.entries(sequenceData).map(
                ([key, value]): KeyValuePair => ({
                    key,
                    value: value.toString(),
                }),
            ),
        }));

const mapErrorsAndWarnings = (
    reviewData: SequenceReview,
    key: string,
    type: ProcessingAnnotationSourceType,
): { errors: string[]; warnings: string[] } => ({
    errors: (reviewData.errors ?? [])
        .filter((error) => error.source.find((source) => source.name === key && source.type === type) !== undefined)
        .map((error) => error.message),
    warnings: (reviewData.warnings ?? [])
        .filter((warning) => warning.source.find((source) => source.name === key && source.type === type) !== undefined)
        .map((warning) => warning.message),
});

const submitReview = async (
    reviewData: SequenceReview,
    editedMetadata: Row[],
    editedSequences: Row[],
    username: string,
    clientConfig: ClientConfig,
): Promise<Result<undefined, string>> => {
    const body: UnprocessedData = {
        sequenceId: reviewData.sequenceId,
        version: reviewData.version,
        data: {
            metadata: editedMetadata.reduce((prev, row) => ({ ...prev, [row.key]: row.value }), {}),
            unalignedNucleotideSequences: editedSequences.reduce(
                (prev, row) => ({ ...prev, [row.key]: row.value }),
                {},
            ),
        },
    };

    return clientFetch({
        endpoint: `/submit-reviewed-sequence?username=${username}`,
        backendUrl: clientConfig.backendUrl,
        zodSchema: undefined,
        options: {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(body),
        },
    });
};
