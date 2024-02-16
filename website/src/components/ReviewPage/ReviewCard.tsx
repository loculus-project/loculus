import type { FC } from 'react';
import { Tooltip } from 'react-tooltip';

import { backendClientHooks } from '../../services/serviceHooks.ts';
import {
    awaitingApprovalStatus,
    type DataUseTerms,
    hasErrorsStatus,
    inProcessingStatus,
    type ProcessingAnnotation,
    receivedStatus,
    restrictedDataUseTermsType,
    type SequenceEntryStatus,
    type SequenceEntryStatusNames,
    type SequenceEntryToEdit,
} from '../../types/backend.ts';
import type { ClientConfig } from '../../types/runtimeConfig.ts';
import { createAuthorizationHeader } from '../../utils/createAuthorizationHeader.ts';
import { displayMetadataField } from '../../utils/displayMetadataField.ts';
import Edit from '~icons/bxs/edit';
import Trash from '~icons/bxs/trash';
import Send from '~icons/fa/send';
import Note from '~icons/fluent/note-24-filled';
import QuestionMark from '~icons/fluent/tag-question-mark-24-filled';
import Locked from '~icons/fluent-emoji-high-contrast/locked';
import Unlocked from '~icons/fluent-emoji-high-contrast/unlocked';
import EmptyCircle from '~icons/grommet-icons/empty-circle';
import TickOutline from '~icons/mdi/tick-outline';

type ReviewCardProps = {
    sequenceEntryStatus: SequenceEntryStatus;
    deleteAccessionVersion: () => void;
    approveAccessionVersion: () => void;
    editAccessionVersion: () => void;
    clientConfig: ClientConfig;
    organism: string;
    accessToken: string;
};

export const ReviewCard: FC<ReviewCardProps> = ({
    sequenceEntryStatus,
    approveAccessionVersion,
    deleteAccessionVersion,
    editAccessionVersion,
    clientConfig,
    organism,
    accessToken,
}) => {
    const { isLoading, data } = useGetMetadataAndAnnotations(organism, clientConfig, accessToken, sequenceEntryStatus);

    return (
        <div className='p-3 border rounded-md shadow-lg relative transition-all duration-500'>
            <ButtonBar
                sequenceEntryStatus={sequenceEntryStatus}
                approveAccessionVersion={approveAccessionVersion}
                deleteAccessionVersion={deleteAccessionVersion}
                editAccessionVersion={editAccessionVersion}
            />
            <div className='flex flex-wrap '>
                <StatusIcon
                    status={sequenceEntryStatus.status}
                    dataUseTerms={sequenceEntryStatus.dataUseTerms}
                    accession={sequenceEntryStatus.accession}
                    hasWarnings={(data?.warnings?.length ?? 0) > 0}
                />
                <KeyValueComponent
                    keyName={sequenceEntryStatus.submissionId}
                    value={sequenceEntryStatus.accession}
                    extraStyle='font-medium'
                    keyStyle=' text-gray-600'
                />
                {data !== undefined && (
                    <>
                        <MetadataList data={data} isLoading={isLoading} />
                        <Errors errors={data.errors ?? []} accession={sequenceEntryStatus.accession} />
                        <Warnings warnings={data.warnings ?? []} accession={sequenceEntryStatus.accession} />
                    </>
                )}
            </div>
        </div>
    );
};

type ButtonBarProps = {
    sequenceEntryStatus: SequenceEntryStatus;
    approveAccessionVersion: () => void;
    deleteAccessionVersion: () => void;
    editAccessionVersion: () => void;
};

const ButtonBar: FC<ButtonBarProps> = ({
    sequenceEntryStatus,
    approveAccessionVersion,
    deleteAccessionVersion,
    editAccessionVersion,
}) => {
    const buttonBarClass = (disabled: boolean) =>
        `${
            disabled ? 'text-gray-300' : 'text-gray-500 hover:text-gray-900 hover:cursor-pointer'
        } inline-block mr-2 mb-2 text-xl`;

    return (
        <div className='absolute top-3 right-3 flex flex-wrap space-x-2'>
            <button
                className={buttonBarClass(sequenceEntryStatus.status !== awaitingApprovalStatus)}
                onClick={approveAccessionVersion}
                data-tooltip-id={'approve-tooltip' + sequenceEntryStatus.accession}
                disabled={sequenceEntryStatus.status !== awaitingApprovalStatus}
            >
                <Send />
            </button>
            <Tooltip
                id={'approve-tooltip' + sequenceEntryStatus.accession}
                content={
                    sequenceEntryStatus.status === awaitingApprovalStatus
                        ? 'Release this sequence entry'
                        : sequenceEntryStatus.status === hasErrorsStatus
                          ? 'Cannot release. Fix Errors!'
                          : 'Cannot release. Wait for preprocessing!'
                }
            />

            <button
                className={buttonBarClass(
                    sequenceEntryStatus.status !== hasErrorsStatus &&
                        sequenceEntryStatus.status !== awaitingApprovalStatus,
                )}
                data-tooltip-id={'edit-tooltip' + sequenceEntryStatus.accession}
                onClick={editAccessionVersion}
                disabled={
                    sequenceEntryStatus.status !== hasErrorsStatus &&
                    sequenceEntryStatus.status !== awaitingApprovalStatus
                }
            >
                <Edit />
            </button>
            <Tooltip
                id={'edit-tooltip' + sequenceEntryStatus.accession}
                content={
                    sequenceEntryStatus.status !== hasErrorsStatus &&
                    sequenceEntryStatus.status !== awaitingApprovalStatus
                        ? 'Cannot edit. Wait for preprocessing!'
                        : 'Edit this sequence entry'
                }
            />

            <button
                className={buttonBarClass(
                    sequenceEntryStatus.status !== hasErrorsStatus &&
                        sequenceEntryStatus.status !== awaitingApprovalStatus,
                )}
                onClick={deleteAccessionVersion}
                data-tooltip-id={'delete-tooltip' + sequenceEntryStatus.accession}
                disabled={
                    sequenceEntryStatus.status !== hasErrorsStatus &&
                    sequenceEntryStatus.status !== awaitingApprovalStatus
                }
            >
                <Trash />
            </button>
            <Tooltip
                id={'delete-tooltip' + sequenceEntryStatus.accession}
                content={
                    sequenceEntryStatus.status !== hasErrorsStatus &&
                    sequenceEntryStatus.status !== awaitingApprovalStatus
                        ? 'Cannot discard. Wait for preprocessing.'
                        : 'Discard this sequence entry'
                }
            />
        </div>
    );
};

type MetadataListProps = {
    data: SequenceEntryToEdit;
    isLoading: boolean;
};

const isAnnotationPresent = (metadataField: string) => (item: ProcessingAnnotation) =>
    item.source[0].name === metadataField;

const MetadataList: FC<MetadataListProps> = ({ data, isLoading }) => (
    <div className='flex flex-row flex-wrap'>
        {!isLoading &&
            Object.entries(data.processedData.metadata).map(([metadataName, value], index) => (
                <KeyValueComponent
                    key={index}
                    keyName={metadataName}
                    value={displayMetadataField(value)}
                    warnings={data.warnings?.filter(isAnnotationPresent(metadataName))}
                    errors={data.errors?.filter(isAnnotationPresent(metadataName))}
                />
            ))}
    </div>
);

type ErrorsProps = {
    errors: ProcessingAnnotation[];
    accession: string;
};

const Errors: FC<ErrorsProps> = ({ errors, accession }) => {
    return (
        <div>
            <div className='flex flex-col m-2 '>
                {errors.map((error) => {
                    const uniqueKey = error.source.map((source) => source.type + source.name).join('.');
                    return (
                        <>
                            <p
                                key={uniqueKey}
                                className='text-red-600'
                                data-tooltip-id={'error-tooltip-' + accession + '-' + uniqueKey}
                            >
                                {error.message}
                            </p>
                            <Tooltip
                                id={'error-tooltip-' + accession + '-' + uniqueKey}
                                content='You must fix this error before releasing this sequence entry'
                            />
                        </>
                    );
                })}
            </div>
        </div>
    );
};

type WarningsProps = {
    warnings: ProcessingAnnotation[];
    accession: string;
};

const Warnings: FC<WarningsProps> = ({ warnings, accession }) => {
    return (
        <div>
            <div className='flex flex-col m-2 '>
                {warnings.map((warning) => (
                    <p
                        key={warning.source.map((source) => source.type + source.name).join('.') + accession}
                        className='text-yellow-500'
                    >
                        {warning.message}
                    </p>
                ))}
            </div>
        </div>
    );
};

type DataUseTermsIconProps = {
    dataUseTerms: DataUseTerms;
    accession: string;
};
const DataUseTermsIcon: FC<DataUseTermsIconProps> = ({ dataUseTerms, accession }) => {
    const hintText =
        dataUseTerms.type === restrictedDataUseTermsType
            ? `Data use restricted until ${dataUseTerms.restrictedUntil}`
            : `Data open to use`;

    return (
        <>
            <div data-tooltip-id={'dataUseTerm-tooltip-' + accession}>
                {dataUseTerms.type === restrictedDataUseTermsType ? <Locked /> : <Unlocked />}
            </div>
            <Tooltip id={'dataUseTerm-tooltip-' + accession} content={hintText} />
        </>
    );
};

type StatusIconProps = {
    status: SequenceEntryStatusNames;
    dataUseTerms: DataUseTerms;
    accession: string;
    hasWarnings?: boolean;
};

const StatusIcon: FC<StatusIconProps> = ({ status, dataUseTerms, accession, hasWarnings }) => {
    if (status === receivedStatus) {
        return (
            <div className='p-2 flex flex-col justify-between'>
                <div data-tooltip-id={'awaitingProcessing-tooltip-' + accession}>
                    <EmptyCircle className='text-gray-500' />
                </div>
                <Tooltip id={'awaitingProcessing-tooltip-' + accession} content='Awaiting processing' />
                <DataUseTermsIcon dataUseTerms={dataUseTerms} accession={accession} />
            </div>
        );
    }
    if (status === hasErrorsStatus) {
        return (
            <div className='p-2 flex flex-col justify-between'>
                <div data-tooltip-id={`error-tooltip-` + accession}>
                    <QuestionMark className='text-red-600' />
                </div>
                <Tooltip id={`error-tooltip-` + accession} content='Error detected' />
                <DataUseTermsIcon dataUseTerms={dataUseTerms} accession={accession} />
            </div>
        );
    }
    if (status === inProcessingStatus) {
        return (
            <div className='p-2 flex flex-col justify-between'>
                <div data-tooltip-id={'inProcessing-tooltip-' + accession}>
                    <span className='loading loading-spinner loading-sm' />
                </div>
                <Tooltip id={'inProcessing-tooltip-' + accession} content='In processing' />
                <DataUseTermsIcon dataUseTerms={dataUseTerms} accession={accession} />
            </div>
        );
    }
    if (status === awaitingApprovalStatus) {
        return (
            // TODO(#702): When queries are implemented, this should be a yellow tick with a warning note if there are warnings
            <div className='p-2 flex flex-col justify-between'>
                <div data-tooltip-id={'awaitingApproval-tooltip-' + accession}>
                    <TickOutline className={hasWarnings === true ? 'text-yellow-400' : `text-green-500`} />
                </div>
                <Tooltip
                    id={'awaitingApproval-tooltip-' + accession}
                    content='Passed QC [TODO: sometimes (with warnings)]'
                />
                <DataUseTermsIcon dataUseTerms={dataUseTerms} accession={accession} />
            </div>
        );
    }
};

type KeyValueComponentProps = {
    keyName: string;
    value: string;
    extraStyle?: string;
    keyStyle?: string;
    warnings?: ProcessingAnnotation[];
    errors?: ProcessingAnnotation[];
};

const KeyValueComponent: FC<KeyValueComponentProps> = ({ keyName, value, extraStyle, keyStyle, warnings, errors }) => {
    return (
        <div className={`flex flex-col m-2 `}>
            <span className={keyStyle !== undefined ? keyStyle : 'text-gray-500 uppercase text-xs'}>{keyName}</span>
            <span className={`text-base ${extraStyle}`}>
                {value}
                {warnings !== undefined && warnings.length > 0 && (
                    <>
                        <span className='text-yellow-500' data-tooltip-id={'warning-tooltip-' + keyName}>
                            <Note className='inline-block' />
                        </span>
                        <Tooltip
                            id={'warning-tooltip-' + keyName}
                            content={warnings.map((annotation) => annotation.message).join(', ')}
                        />
                    </>
                )}
                {errors !== undefined && errors.length > 0 && (
                    <>
                        <span className='text-red-600' data-tooltip-id={'error-tooltip-' + keyName}>
                            <Note className='inline-block' />
                        </span>
                        <Tooltip
                            id={'error-tooltip-' + keyName}
                            content={errors.map((annotation) => annotation.message).join(', ')}
                        />
                    </>
                )}
            </span>
        </div>
    );
};

function useGetMetadataAndAnnotations(
    organism: string,
    clientConfig: ClientConfig,
    accessToken: string,
    sequenceEntryStatus: SequenceEntryStatus,
) {
    const { status, accession, version } = sequenceEntryStatus;
    return backendClientHooks(clientConfig).useGetDataToEdit(
        {
            headers: createAuthorizationHeader(accessToken),
            params: { organism, accession, version },
        },
        { enabled: status !== receivedStatus && status !== inProcessingStatus },
    );
}
