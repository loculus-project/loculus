import { type FC, useState, useRef, useEffect } from 'react';

import { FilesDialog } from './FilesDialog.tsx';
import { SequencesDialog } from './SequencesDialog.tsx';
import { backendClientHooks } from '../../services/serviceHooks.ts';
import {
    type DataUseTerms,
    processedStatus,
    inProcessingStatus,
    type ProcessingAnnotation,
    receivedStatus,
    restrictedDataUseTermsOption,
    type SequenceEntryStatus,
    type SequenceEntryStatusNames,
    type SequenceEntryToEdit,
    errorsProcessingResult,
    warningsProcessingResult,
} from '../../types/backend.ts';
import type { ReferenceGenomes } from '../../types/referencesGenomes.ts';
import type { ClientConfig } from '../../types/runtimeConfig.ts';
import { CustomTooltip } from '../../utils/CustomTooltip.tsx';
import { createAuthorizationHeader } from '../../utils/createAuthorizationHeader.ts';
import { displayMetadataField } from '../../utils/displayMetadataField.ts';
import { getAccessionVersionString } from '../../utils/extractAccessionVersion.ts';
import { Button } from '../common/Button';
import BiTrash from '~icons/bi/trash';
import ClarityNoteEditLine from '~icons/clarity/note-edit-line';
import Note from '~icons/fluent/note-24-filled';
import QuestionMark from '~icons/fluent/tag-question-mark-24-filled';
import Locked from '~icons/fluent-emoji-high-contrast/locked';
import Unlocked from '~icons/fluent-emoji-high-contrast/unlocked';
import EmptyCircle from '~icons/grommet-icons/empty-circle';
import Files from '~icons/lucide/files';
import RiDna from '~icons/mdi/dna';
import TickOutline from '~icons/mdi/tick-outline';
import WpfPaperPlane from '~icons/wpf/paper-plane';

type ReviewCardProps = {
    sequenceEntryStatus: SequenceEntryStatus;
    metadataDisplayNames: Map<string, string>;
    deleteAccessionVersion: () => void;
    approveAccessionVersion: () => void;
    editAccessionVersion: () => void;
    clientConfig: ClientConfig;
    organism: string;
    accessToken: string;
    filesEnabled: boolean;
    referenceGenomes: ReferenceGenomes;
};

export const ReviewCard: FC<ReviewCardProps> = ({
    sequenceEntryStatus,
    metadataDisplayNames,
    approveAccessionVersion,
    deleteAccessionVersion,
    editAccessionVersion,
    clientConfig,
    organism,
    accessToken,
    filesEnabled,
    referenceGenomes,
}) => {
    const [isSequencesDialogOpen, setSequencesDialogOpen] = useState(false);
    const [isFilesDialogOpen, setFilesDialogOpen] = useState(false);
    const { isLoading, data } = useGetMetadataAndAnnotations(organism, clientConfig, accessToken, sequenceEntryStatus);
    const hasFiles = Object.entries(data?.processedData.files ?? {}).length > 0;

    const notProcessed = sequenceEntryStatus.status !== processedStatus;

    return (
        <div className='px-3 py-2 relative transition-all duration-500'>
            <div className='flex'>
                <div className='flex flex-grow flex-wrap '>
                    <StatusIcon
                        status={sequenceEntryStatus.status}
                        dataUseTerms={sequenceEntryStatus.dataUseTerms}
                        accession={sequenceEntryStatus.accession}
                        hasWarnings={sequenceEntryStatus.processingResult === warningsProcessingResult}
                        hasErrors={sequenceEntryStatus.processingResult === errorsProcessingResult}
                    />
                    <KeyValueComponent
                        accessionVersion={getAccessionVersionString(sequenceEntryStatus)}
                        keyName={getAccessionVersionString(sequenceEntryStatus)}
                        value={sequenceEntryStatus.submissionId}
                    />
                    {data !== undefined && (
                        <MetadataList data={data} metadataDisplayNames={metadataDisplayNames} isLoading={isLoading} />
                    )}
                    {sequenceEntryStatus.isRevocation && (
                        <KeyValueComponent
                            accessionVersion={getAccessionVersionString(sequenceEntryStatus)}
                            keyName='Revocation entry'
                            value='This is a revocation entry, which will create a new version that revokes this accession'
                            extraStyle='text-red-600 font-semibold'
                            disableTruncate
                        />
                    )}
                </div>
                <ButtonBar
                    sequenceEntryStatus={sequenceEntryStatus}
                    approveAccessionVersion={approveAccessionVersion}
                    deleteAccessionVersion={deleteAccessionVersion}
                    editAccessionVersion={editAccessionVersion}
                    viewSequences={data && !notProcessed ? () => setSequencesDialogOpen(true) : undefined}
                    viewFiles={data && !notProcessed ? () => setFilesDialogOpen(true) : undefined}
                    filesEnabled={filesEnabled}
                    hasFiles={hasFiles}
                />
            </div>

            {data?.errors?.length !== undefined && data.errors.length > 0 && (
                <Errors
                    errors={data.errors}
                    accession={sequenceEntryStatus.accession}
                    metadataDisplayNames={metadataDisplayNames}
                />
            )}
            {data?.warnings?.length !== undefined && data.warnings.length > 0 && (
                <Warnings warnings={data.warnings} accession={sequenceEntryStatus.accession} />
            )}

            <SequencesDialog
                isOpen={isSequencesDialogOpen}
                onClose={() => setSequencesDialogOpen(false)}
                dataToView={data}
                referenceGenomes={referenceGenomes}
            />
            <FilesDialog isOpen={isFilesDialogOpen} onClose={() => setFilesDialogOpen(false)} dataToView={data} />
        </div>
    );
};

type ButtonBarProps = {
    sequenceEntryStatus: SequenceEntryStatus;
    approveAccessionVersion: () => void;
    deleteAccessionVersion: () => void;
    editAccessionVersion: () => void;
    viewSequences?: () => void;
    viewFiles?: () => void;
    filesEnabled: boolean;
    hasFiles: boolean;
};

const ButtonBar: FC<ButtonBarProps> = ({
    sequenceEntryStatus,
    approveAccessionVersion,
    deleteAccessionVersion,
    editAccessionVersion,
    viewSequences,
    viewFiles,
    filesEnabled,
    hasFiles,
}) => {
    const buttonBarClass = (disabled: boolean) =>
        `${disabled ? 'text-gray-300' : 'text-gray-500 hover:text-gray-900 hover:cursor-pointer'} inline-block text-xl`;
    const approvable =
        sequenceEntryStatus.status === processedStatus &&
        !(sequenceEntryStatus.processingResult === errorsProcessingResult);
    const notProcessed = sequenceEntryStatus.status !== processedStatus;

    return (
        <div className='flex mb-auto pt-3.5 items-center'>
            <div className='flex space-x-4'>
                {filesEnabled && viewFiles && (
                    <>
                        <Button
                            className={buttonBarClass(!hasFiles)}
                            onClick={viewFiles}
                            data-tooltip-id={'view-files-tooltip' + sequenceEntryStatus.accession}
                            data-testid={`view-files-${sequenceEntryStatus.accession}`}
                            key={'view-files-button-' + sequenceEntryStatus.accession}
                            disabled={!hasFiles}
                        >
                            <Files />
                        </Button>
                        <CustomTooltip
                            id={'view-files-tooltip' + sequenceEntryStatus.accession}
                            content={hasFiles ? 'View files' : 'No files for this entry'}
                        />
                    </>
                )}
                {viewSequences && (
                    <>
                        <Button
                            className={buttonBarClass(false)}
                            onClick={viewSequences}
                            data-tooltip-id={'view-sequences-tooltip' + sequenceEntryStatus.accession}
                            data-testid={`view-sequences-${sequenceEntryStatus.accession}`}
                            key={'view-sequences-button-' + sequenceEntryStatus.accession}
                        >
                            <RiDna />
                        </Button>
                        <CustomTooltip
                            id={'view-sequences-tooltip' + sequenceEntryStatus.accession}
                            content={'View processed sequences'}
                        />
                    </>
                )}
                <div className='mx-3 h-5 mt-0.5 border-l border-gray-300'></div> {/* Vertical separator */}
                <Button
                    className={buttonBarClass(!approvable)}
                    onClick={approveAccessionVersion}
                    data-tooltip-id={'approve-tooltip' + sequenceEntryStatus.accession}
                    key={'approve-button-' + sequenceEntryStatus.accession}
                    disabled={!approvable}
                >
                    <WpfPaperPlane />
                </Button>
                <CustomTooltip
                    id={'approve-tooltip' + sequenceEntryStatus.accession}
                    content={
                        approvable
                            ? 'Release this sequence entry'
                            : sequenceEntryStatus.processingResult === errorsProcessingResult
                              ? 'You need to fix the errors before releasing this sequence entry'
                              : 'Still awaiting preprocessing'
                    }
                />
                {!sequenceEntryStatus.isRevocation && (
                    <Button
                        className={buttonBarClass(notProcessed)}
                        data-testid={`${getAccessionVersionString({ ...sequenceEntryStatus })}.edit`}
                        data-tooltip-id={'edit-tooltip' + sequenceEntryStatus.accession}
                        key={'edit-button-' + sequenceEntryStatus.accession}
                        onClick={editAccessionVersion}
                        disabled={notProcessed}
                    >
                        <ClarityNoteEditLine />
                    </Button>
                )}
                <CustomTooltip
                    id={'edit-tooltip' + sequenceEntryStatus.accession}
                    content={notProcessed ? 'Processing...' : 'Edit this sequence entry'}
                />
                <Button
                    className={buttonBarClass(notProcessed)}
                    onClick={deleteAccessionVersion}
                    data-tooltip-id={'delete-tooltip' + sequenceEntryStatus.accession}
                    key={'delete-button-' + sequenceEntryStatus.accession}
                    disabled={notProcessed}
                >
                    <BiTrash />
                </Button>
                <CustomTooltip
                    id={'delete-tooltip' + sequenceEntryStatus.accession}
                    content={notProcessed ? 'Cannot discard. Wait for preprocessing.' : 'Discard this sequence entry'}
                />
            </div>
        </div>
    );
};

type MetadataListProps = {
    data: SequenceEntryToEdit;
    metadataDisplayNames: Map<string, string>;
    isLoading: boolean;
};

const isAnnotationPresent = (metadataField: string) => (item: ProcessingAnnotation) =>
    item.processedFields[0].name === metadataField;

const MetadataList: FC<MetadataListProps> = ({ data, isLoading, metadataDisplayNames }) =>
    !isLoading &&
    Object.entries(data.processedData.metadata).map(([metadataName, value], index) =>
        value === null ? null : (
            <KeyValueComponent
                accessionVersion={getAccessionVersionString(data)}
                key={index}
                keyName={metadataDisplayNames.get(metadataName) ?? metadataName}
                value={displayMetadataField(value)}
                warnings={data.warnings?.filter(isAnnotationPresent(metadataName))}
                errors={data.errors?.filter(isAnnotationPresent(metadataName))}
            />
        ),
    );

type ErrorsProps = {
    errors: ProcessingAnnotation[];
    accession: string;
    metadataDisplayNames: Map<string, string>;
};

const Errors: FC<ErrorsProps> = ({ errors, accession, metadataDisplayNames }) => {
    return (
        <div>
            <div className='flex flex-col m-2 '>
                {errors.map((error) => {
                    const uniqueKey =
                        error.processedFields.map((field) => field.type + field.name).join('.') + accession;
                    const processedFieldName = error.processedFields
                        .map((field) => metadataDisplayNames.get(field.name) ?? field.name)
                        .join(', ');
                    return (
                        <div key={uniqueKey} className='flex flex-shrink-0'>
                            <p
                                className='text-red-600'
                                data-tooltip-id={'error-tooltip-' + accession + '-' + uniqueKey}
                            >
                                {processedFieldName}: {error.message}
                            </p>
                            <CustomTooltip
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
                {warnings.map((warning) => {
                    const processedFieldName = warning.processedFields.map((field) => field.name).join(', ');
                    return (
                        <p
                            key={warning.processedFields.map((field) => field.type + field.name).join('.') + accession}
                            className='text-yellow-500'
                        >
                            {processedFieldName}: {warning.message}
                        </p>
                    );
                })}
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
        dataUseTerms.type === restrictedDataUseTermsOption
            ? `Under the Restricted Use Terms until ${dataUseTerms.restrictedUntil}`
            : `To be released as open data`;

    return (
        <>
            <div data-tooltip-id={'dataUseTerm-tooltip-' + accession}>
                {dataUseTerms.type === restrictedDataUseTermsOption ? <Locked /> : <Unlocked />}
            </div>
            <CustomTooltip id={'dataUseTerm-tooltip-' + accession} content={hintText} />
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
                <CustomTooltip id={'awaitingProcessing-tooltip-' + accession} content='Awaiting processing' />
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
                <CustomTooltip id={`error-tooltip-` + accession} content='Error detected' />
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
                <CustomTooltip id={'inProcessing-tooltip-' + accession} content='In processing' />
                <DataUseTermsIcon dataUseTerms={dataUseTerms} accession={accession} />
            </div>
        );
    }
    if (status === processedStatus && !hasErrors) {
        return (
            <div className='p-2 flex flex-col justify-between'>
                <div data-tooltip-id={'awaitingApproval-tooltip-' + accession}>
                    <TickOutline className={hasWarnings ? 'text-yellow-400' : `text-green-500`} />
                </div>
                <CustomTooltip
                    id={'awaitingApproval-tooltip-' + accession}
                    content={hasWarnings ? 'Passed QC with warnings' : 'Passed QC'}
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
    disableTruncate?: boolean;
};

const KeyValueComponent: FC<KeyValueComponentProps> = ({
    accessionVersion,
    keyName,
    value,
    extraStyle,
    keyStyle,
    warnings,
    errors,
    disableTruncate = false,
}) => {
    const { textColor, primaryMessages, secondaryMessages } = getTextColorAndMessages(errors, warnings);

    const textTooltipId = 'text-tooltip-' + keyName + accessionVersion;
    const noteTooltipId = 'note-tooltip-' + keyName + accessionVersion;

    const textRef = useRef<HTMLSpanElement>(null);
    const [isTruncated, setIsTruncated] = useState(false);

    useEffect(() => {
        if (textRef.current && !disableTruncate) {
            setIsTruncated(textRef.current.scrollWidth > textRef.current.clientWidth);
        } else {
            setIsTruncated(false);
        }
    }, [value, disableTruncate]);

    const showTooltip = primaryMessages !== undefined || isTruncated;
    const tooltipContent =
        primaryMessages !== undefined ? primaryMessages.map((annotation) => annotation.message).join(', ') : value;

    return (
        <div className={`flex flex-col m-2 `}>
            <span className={keyStyle ?? 'text-gray-500 uppercase text-xs'}>{keyName}</span>
            <span className={`text-base ${extraStyle}`}>
                <span
                    ref={textRef}
                    className={`${textColor} ${disableTruncate ? '' : 'truncate max-w-xs inline-block'}`}
                    data-tooltip-id={showTooltip ? textTooltipId : undefined}
                >
                    {value}
                </span>
                {showTooltip && <CustomTooltip id={textTooltipId} content={tooltipContent} />}
                {secondaryMessages !== undefined && (
                    <>
                        <Note className='text-yellow-500 inline-block' data-tooltip-id={noteTooltipId} />
                        <CustomTooltip
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
    const { status, accession, version, isRevocation } = sequenceEntryStatus;
    return backendClientHooks(clientConfig).useGetDataToEdit(
        {
            headers: createAuthorizationHeader(accessToken),
            params: { organism, accession, version },
        },
        {
            enabled: status !== receivedStatus && status !== inProcessingStatus && !isRevocation,
        },
    );
}
