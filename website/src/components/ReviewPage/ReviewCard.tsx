import { type FC } from 'react';
import { Tooltip } from 'react-tooltip';

import { backendClientHooks } from '../../services/serviceHooks.ts';
import {
    type DataUseTerms,
    processedStatus,
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
import { getAccessionVersionString } from '../../utils/extractAccessionVersion.ts';
import BiTrash from '~icons/bi/trash';
import ClarityNoteEditLine from '~icons/clarity/note-edit-line';
import Note from '~icons/fluent/note-24-filled';
import QuestionMark from '~icons/fluent/tag-question-mark-24-filled';
import Locked from '~icons/fluent-emoji-high-contrast/locked';
import Unlocked from '~icons/fluent-emoji-high-contrast/unlocked';
import EmptyCircle from '~icons/grommet-icons/empty-circle';
import TickOutline from '~icons/mdi/tick-outline';
import WpfPaperPlane from '~icons/wpf/paper-plane';

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
    // TODO the hook above makes an extra call for each row.
    // We want to get all relevant data passed in instead.

    return (
        <div className='px-3 py-2   relative transition-all duration-500'>
            <div className='flex'>
                <div className='flex flex-grow flex-wrap '>
                    <StatusIcon
                        status={sequenceEntryStatus.status}
                        dataUseTerms={sequenceEntryStatus.dataUseTerms}
                        accession={sequenceEntryStatus.accession}
                        hasWarnings={sequenceEntryStatus.isWarning}
                        hasErrors={sequenceEntryStatus.isError}
                    />
                    <KeyValueComponent
                        accessionVersion={getAccessionVersionString(sequenceEntryStatus)}
                        keyName={getAccessionVersionString(sequenceEntryStatus)}
                        value={sequenceEntryStatus.submissionId}
                    />
                    {data !== undefined && <MetadataList data={data} isLoading={isLoading} />}
                    {sequenceEntryStatus.isRevocation && (
                        <KeyValueComponent
                            accessionVersion={getAccessionVersionString(sequenceEntryStatus)}
                            keyName='Revocation entry'
                            value='This is a revocation entry, which will create a new version that revokes this accession'
                            extraStyle='text-red-600 font-semibold'
                        />
                    )}
                </div>
                <ButtonBar
                    sequenceEntryStatus={sequenceEntryStatus}
                    approveAccessionVersion={approveAccessionVersion}
                    deleteAccessionVersion={deleteAccessionVersion}
                    editAccessionVersion={editAccessionVersion}
                />
            </div>

            {data?.errors?.length !== undefined && data.errors.length > 0 && (
                <Errors errors={data.errors} accession={sequenceEntryStatus.accession} />
            )}
            {data?.warnings?.length !== undefined && data.warnings.length > 0 && (
                <Warnings warnings={data.warnings} accession={sequenceEntryStatus.accession} />
            )}
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
        } pl-3 inline-block mr-2 mb-2 text-xl`;
    const approvable = sequenceEntryStatus.status === processedStatus && !sequenceEntryStatus.isError;
    const notProcessed = sequenceEntryStatus.status !== processedStatus;

    return (
        <div className='flex space-x-1 mb-auto pt-3.5'>
            <button
                className={buttonBarClass(!approvable)}
                onClick={approveAccessionVersion}
                data-tooltip-id={'approve-tooltip' + sequenceEntryStatus.accession}
                key={'approve-button-' + sequenceEntryStatus.accession}
                disabled={!approvable}
            >
                <WpfPaperPlane />
            </button>
            <Tooltip
                id={'approve-tooltip' + sequenceEntryStatus.accession}
                content={
                    approvable
                        ? 'Release this sequence entry'
                        : sequenceEntryStatus.isError
                          ? 'You need to fix the errors before releasing this sequence entry'
                          : 'Still awaiting preprocessing'
                }
            />
            {!sequenceEntryStatus.isRevocation && (
                <button
                    className={buttonBarClass(notProcessed)}
                    data-testid={`${getAccessionVersionString({ ...sequenceEntryStatus })}.edit`}
                    data-tooltip-id={'edit-tooltip' + sequenceEntryStatus.accession}
                    key={'edit-button-' + sequenceEntryStatus.accession}
                    onClick={editAccessionVersion}
                    disabled={notProcessed}
                >
                    <ClarityNoteEditLine />
                </button>
            )}
            <Tooltip
                id={'edit-tooltip' + sequenceEntryStatus.accession}
                content={notProcessed ? 'Cannot edit. Wait for preprocessing!' : 'Edit this sequence entry'}
            />

            <button
                className={buttonBarClass(notProcessed)}
                onClick={deleteAccessionVersion}
                data-tooltip-id={'delete-tooltip' + sequenceEntryStatus.accession}
                key={'delete-button-' + sequenceEntryStatus.accession}
                disabled={notProcessed}
            >
                <BiTrash />
            </button>
            <Tooltip
                id={'delete-tooltip' + sequenceEntryStatus.accession}
                content={notProcessed ? 'Cannot discard. Wait for preprocessing.' : 'Discard this sequence entry'}
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

const MetadataList: FC<MetadataListProps> = ({ data, isLoading }) =>
    !isLoading &&
    Object.entries(data.processedData.metadata).map(([metadataName, value], index) =>
        value === null ? null : (
            <KeyValueComponent
                accessionVersion={getAccessionVersionString(data)}
                key={index}
                keyName={metadataName}
                value={displayMetadataField(value)}
                warnings={data.warnings?.filter(isAnnotationPresent(metadataName))}
                errors={data.errors?.filter(isAnnotationPresent(metadataName))}
            />
        ),
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
                    const uniqueKey = error.source.map((source) => source.type + source.name).join('.') + accession;
                    return (
                        <div key={uniqueKey} className='flex flex-shrink-0'>
                            <p
                                className='text-red-600'
                                data-tooltip-id={'error-tooltip-' + accession + '-' + uniqueKey}
                            >
                                {error.message}
                            </p>
                            <Tooltip
                                id={'error-tooltip-' + accession + '-' + uniqueKey}
                                content='You must fix this error before releasing this sequence entry'
                            />
                        </div>
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
            ? `Under the Restricted Use Terms until ${dataUseTerms.restrictedUntil}`
            : `To be released as open data`;

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
    hasWarnings: boolean;
    hasErrors: boolean;
};

const StatusIcon: FC<StatusIconProps> = ({ status, dataUseTerms, accession, hasWarnings, hasErrors }) => {
    if (status === receivedStatus) {
        return (
            <div className='p-2 flex flex-col justify-between'>
                <div
                    data-tooltip-id={'awaitingProcessing-tooltip-' + accession}
                    key={'awaitingProcessing-tooltip-' + accession}
                >
                    <EmptyCircle className='text-gray-500' />
                </div>
                <Tooltip id={'awaitingProcessing-tooltip-' + accession} content='Awaiting processing' />
                <DataUseTermsIcon dataUseTerms={dataUseTerms} accession={accession} />
            </div>
        );
    }
    if (status === processedStatus && hasErrors) {
        return (
            <div className='p-2 flex flex-col justify-between'>
                <div data-tooltip-id={`error-tooltip-` + accession} key={'error-tooltip-' + accession}>
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
                <div data-tooltip-id={'inProcessing-tooltip-' + accession} key={'inProcessing-tooltip-' + accession}>
                    <span className='loading loading-spinner loading-sm' />
                </div>
                <Tooltip id={'inProcessing-tooltip-' + accession} content='In processing' />
                <DataUseTermsIcon dataUseTerms={dataUseTerms} accession={accession} />
            </div>
        );
    }
    if (status === processedStatus && !hasErrors) {
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
    accessionVersion: string;
    keyName: string;
    value: string;
    extraStyle?: string;
    keyStyle?: string;
    warnings?: ProcessingAnnotation[];
    errors?: ProcessingAnnotation[];
};

const KeyValueComponent: FC<KeyValueComponentProps> = ({
    accessionVersion,
    keyName,
    value,
    extraStyle,
    keyStyle,
    warnings,
    errors,
}) => {
    const { textColor, primaryMessages, secondaryMessages } = getTextColorAndMessages(errors, warnings);

    const textTooltipId = 'text-tooltip-' + keyName + accessionVersion;
    const noteTooltipId = 'note-tooltip-' + keyName + accessionVersion;

    return (
        <div className={`flex flex-col m-2 `}>
            <span className={keyStyle !== undefined ? keyStyle : 'text-gray-500 uppercase text-xs'}>{keyName}</span>
            <span className={`text-base ${extraStyle}`}>
                <span className={textColor} data-tooltip-id={textTooltipId}>
                    {value}
                </span>
                {primaryMessages !== undefined && (
                    <Tooltip
                        id={textTooltipId}
                        content={primaryMessages.map((annotation) => annotation.message).join(', ')}
                    />
                )}
                {secondaryMessages !== undefined && (
                    <>
                        <Note className='text-yellow-500 inline-block' data-tooltip-id={noteTooltipId} />
                        <Tooltip
                            id={noteTooltipId}
                            content={secondaryMessages.map((annotation) => annotation.message).join(', ')}
                        />
                    </>
                )}
            </span>
        </div>
    );
};

function getTextColorAndMessages(
    errors: ProcessingAnnotation[] | undefined,
    warnings: ProcessingAnnotation[] | undefined,
) {
    const hasErrors = errors !== undefined && errors.length > 0;
    const hasWarnings = warnings !== undefined && warnings.length > 0;

    if (hasErrors) {
        return {
            textColor: 'text-red-600',
            primaryMessages: errors,
            secondaryMessages: hasWarnings ? warnings : undefined,
        };
    }

    if (hasWarnings) {
        return {
            textColor: 'text-yellow-500',
            primaryMessages: warnings,
            secondaryMessages: undefined,
        };
    }

    return {
        textColor: '',
        primaryMessages: undefined,
        secondaryMessages: undefined,
    };
}

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
