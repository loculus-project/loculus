import { type FC } from 'react';
import { Tooltip } from 'react-tooltip';

import {
    type DataUseTerms,
    processedStatus,
    inProcessingStatus,
    type ProcessingAnnotation,
    receivedStatus,
    restrictedDataUseTermsType,
    type SequenceEntryStatus,
    type SequenceEntryStatusNames,
    errorsProcessingResult,
    warningsProcessingResult,
} from '../../types/backend.ts';
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
};

export const ReviewCard: FC<ReviewCardProps> = ({
    sequenceEntryStatus,
    approveAccessionVersion,
    deleteAccessionVersion,
    editAccessionVersion,
}) => {
    return (
        <div className='px-3 py-2   relative transition-all duration-500'>
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
                    <MetadataList data={sequenceEntryStatus} />
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

            {sequenceEntryStatus.errors?.length !== undefined && sequenceEntryStatus.errors.length > 0 && (
                <Errors errors={sequenceEntryStatus.errors} accession={sequenceEntryStatus.accession} />
            )}
            {sequenceEntryStatus.warnings?.length !== undefined && sequenceEntryStatus.warnings.length > 0 && (
                <Warnings warnings={sequenceEntryStatus.warnings} accession={sequenceEntryStatus.accession} />
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
    const approvable =
        sequenceEntryStatus.status === processedStatus &&
        !(sequenceEntryStatus.processingResult === errorsProcessingResult);
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
            <CustomTooltip
                id={'edit-tooltip' + sequenceEntryStatus.accession}
                content={notProcessed ? 'Processing...' : 'Edit this sequence entry'}
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
            <CustomTooltip
                id={'delete-tooltip' + sequenceEntryStatus.accession}
                content={notProcessed ? 'Cannot discard. Wait for preprocessing.' : 'Discard this sequence entry'}
            />
        </div>
    );
};

type MetadataListProps = {
    data: SequenceEntryStatus;
};

const isAnnotationPresent = (metadataField: string) => (item: ProcessingAnnotation) =>
    item.source[0].name === metadataField;

const MetadataList: FC<MetadataListProps> = ({ data }) =>
    data.processedData !== null &&
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
                    <CustomTooltip
                        id={textTooltipId}
                        content={primaryMessages.map((annotation) => annotation.message).join(', ')}
                    />
                )}
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

const CustomTooltip: React.FC<React.ComponentProps<typeof Tooltip>> = ({ ...props }) => (
    // Set positionStrategy and z-index to make the Tooltip float above the ReviewPage toolbar
    <Tooltip positionStrategy='fixed' className='z-20' place='right' {...props} />
);

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
