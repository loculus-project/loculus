import { type FC, useEffect, useMemo, useState } from 'react';

import { DownloadDialogButton } from './DowloadDialogButton.tsx';
import { DownloadButton } from './DownloadButton.tsx';
import type { DownloadDataType } from './DownloadDataType.ts';
import { DownloadForm, type DownloadFormState } from './DownloadForm.tsx';
import { type DownloadOption, type DownloadUrlGenerator } from './DownloadUrlGenerator.ts';
import { getDefaultSelectedFields } from './FieldSelector/FieldSelectorModal.tsx';
import type { SequenceFilter } from './SequenceFilters.tsx';
import { routes } from '../../../routes/routes.ts';
import { ACCESSION_VERSION_FIELD } from '../../../settings.ts';
import type { Metadata, Schema } from '../../../types/config.ts';
import type { ReferenceGenomesInfo } from '../../../types/referencesGenomes.ts';
import { MetadataVisibility } from '../../../utils/search.ts';
import {
    getSegmentAndGeneInfo,
    segmentsWithMultipleReferences,
    type GeneInfo,
    type SegmentInfo,
    type SegmentReferenceSelections,
} from '../../../utils/sequenceTypeHelpers.ts';
import { ActiveFilters } from '../../common/ActiveFilters.tsx';
import { BaseDialog } from '../../common/BaseDialog.tsx';

type DownloadDialogProps = {
    downloadUrlGenerator: DownloadUrlGenerator;
    sequenceFilter: SequenceFilter;
    referenceGenomesInfo: ReferenceGenomesInfo;
    allowSubmissionOfConsensusSequences: boolean;
    dataUseTermsEnabled: boolean;
    schema: Schema;
    richFastaHeaderFields: Schema['richFastaHeaderFields'];
    selectedReferenceNames?: SegmentReferenceSelections;
    referenceIdentifierField: string | undefined;
};

export const DownloadDialog: FC<DownloadDialogProps> = ({
    downloadUrlGenerator,
    sequenceFilter,
    referenceGenomesInfo,
    allowSubmissionOfConsensusSequences,
    dataUseTermsEnabled,
    schema,
    richFastaHeaderFields,
    selectedReferenceNames,
    referenceIdentifierField,
}) => {
    const [isOpen, setIsOpen] = useState(false);

    const openDialog = () => setIsOpen(true);
    const closeDialog = () => setIsOpen(false);

    const segmentAndGeneInfo = useMemo(
        () => getSegmentAndGeneInfo(referenceGenomesInfo, selectedReferenceNames),
        [referenceGenomesInfo, selectedReferenceNames],
    );
    const useMultiSegmentEndpoint = referenceGenomesInfo.useLapisMultiSegmentedEndpoint;

    const [downloadFormState, setDownloadFormState] = useState<DownloadFormState>(
        getDefaultDownloadFormState(segmentAndGeneInfo.nucleotideSegmentInfos, segmentAndGeneInfo.geneInfos),
    );
    useEffect(() => {
        setDownloadFormState(
            getDefaultDownloadFormState(segmentAndGeneInfo.nucleotideSegmentInfos, segmentAndGeneInfo.geneInfos),
        );
    }, [segmentAndGeneInfo.nucleotideSegmentInfos, segmentAndGeneInfo.geneInfos]);
    const [agreedToDataUseTerms, setAgreedToDataUseTerms] = useState(dataUseTermsEnabled ? false : true);
    const [selectedFields, setSelectedFields] = useState<Set<string>>(getDefaultSelectedFields(schema.metadata)); // This is here so that the state is persisted across closing and reopening the dialog

    const downloadFieldVisibilities = useMemo(() => {
        return new Map(
            schema.metadata.map((field) => [
                field.name,
                new MetadataVisibility(selectedFields.has(field.name), field.onlyForReference, field.relatesToSegment),
            ]),
        );
    }, [selectedFields, schema]);

    const downloadOption = getDownloadOption({
        downloadFormState,
        nucleotideSegmentInfos: segmentAndGeneInfo.nucleotideSegmentInfos,
        geneInfos: segmentAndGeneInfo.geneInfos,
        useMultiSegmentEndpoint,
        getVisibleFields: () => [
            ...Array.from(downloadFieldVisibilities.entries())
                .filter(([_, visibility]) => visibility.isVisible(referenceGenomesInfo, selectedReferenceNames, false))
                .map(([name]) => name),
        ],
        metadata: schema.metadata,
        defaultFastaHeaderTemplate:
            segmentsWithMultipleReferences(referenceGenomesInfo).length > 0
                ? `{${ACCESSION_VERSION_FIELD}}`
                : undefined,
    });

    return (
        <>
            <DownloadDialogButton sequenceFilter={sequenceFilter} onClick={openDialog} />
            <BaseDialog title='Download' isOpen={isOpen} onClose={closeDialog} fullWidth={false}>
                <div className='mt-2'>
                    {!sequenceFilter.isEmpty() && (
                        <div className='mb-4'>
                            <h4 className='font-bold mb-2'>Active filters</h4>
                            <ActiveFilters sequenceFilter={sequenceFilter} />
                        </div>
                    )}
                    <DownloadForm
                        referenceGenomesInfo={referenceGenomesInfo}
                        downloadFormState={downloadFormState}
                        setDownloadFormState={setDownloadFormState}
                        allowSubmissionOfConsensusSequences={allowSubmissionOfConsensusSequences}
                        dataUseTermsEnabled={dataUseTermsEnabled}
                        schema={schema}
                        downloadFieldVisibilities={downloadFieldVisibilities}
                        onSelectedFieldsChange={setSelectedFields}
                        richFastaHeaderFields={richFastaHeaderFields}
                        selectedReferenceNames={selectedReferenceNames}
                        referenceIdentifierField={referenceIdentifierField}
                    />
                    {dataUseTermsEnabled && (
                        <div className='mb-4 py-4'>
                            <label className='flex items-center'>
                                <input
                                    type='checkbox'
                                    name='data-use-terms-agreement'
                                    className='mr-3 ml-1 h-5 w-5 rounded border-gray-300 text-primary-600 focus:ring-primary-600'
                                    checked={agreedToDataUseTerms}
                                    onChange={() => setAgreedToDataUseTerms(!agreedToDataUseTerms)}
                                />
                                <span className='text-sm'>
                                    I agree to the{' '}
                                    <a
                                        href={routes.datauseTermsPage()}
                                        className='underline'
                                        target='_blank'
                                        rel='noopener noreferrer'
                                    >
                                        data use terms
                                    </a>
                                    .
                                </span>
                            </label>
                        </div>
                    )}
                    <DownloadButton
                        downloadUrlGenerator={downloadUrlGenerator}
                        downloadOption={downloadOption}
                        sequenceFilter={sequenceFilter}
                        disabled={!agreedToDataUseTerms}
                        onClick={closeDialog}
                    />
                </div>
            </BaseDialog>
        </>
    );
};

function getDefaultDownloadFormState(nucleotideSegmentInfos: SegmentInfo[], geneInfos: GeneInfo[]): DownloadFormState {
    return {
        includeRestricted: false,
        dataType: 'metadata',
        compression: undefined,
        unalignedNucleotideSequence: nucleotideSegmentInfos[0]?.lapisName ?? '',
        alignedNucleotideSequence: nucleotideSegmentInfos[0]?.lapisName ?? '',
        alignedAminoAcidSequence: geneInfos[0]?.lapisName ?? '',
        includeRichFastaHeaders: false,
    };
}

function getDownloadOption({
    downloadFormState,
    useMultiSegmentEndpoint,
    getVisibleFields,
    metadata,
    defaultFastaHeaderTemplate,
}: {
    downloadFormState: DownloadFormState;
    nucleotideSegmentInfos: SegmentInfo[];
    geneInfos: GeneInfo[];
    useMultiSegmentEndpoint: boolean;
    getVisibleFields: () => string[];
    metadata: Metadata[];
    defaultFastaHeaderTemplate?: string;
}): DownloadOption {
    const assembleDownloadDataType = (): DownloadDataType => {
        switch (downloadFormState.dataType) {
            case 'metadata':
                return {
                    type: downloadFormState.dataType,
                    fields: orderFieldsForDownload(getVisibleFields(), metadata),
                };
            case 'unalignedNucleotideSequences':
                return {
                    type: downloadFormState.dataType,
                    segment: useMultiSegmentEndpoint ? downloadFormState.unalignedNucleotideSequence : undefined,
                    richFastaHeaders:
                        defaultFastaHeaderTemplate !== undefined
                            ? { include: true, fastaHeaderOverride: defaultFastaHeaderTemplate }
                            : { include: downloadFormState.includeRichFastaHeaders },
                };
            case 'alignedNucleotideSequences':
                return {
                    type: downloadFormState.dataType,
                    segment: useMultiSegmentEndpoint ? downloadFormState.alignedNucleotideSequence : undefined,
                    richFastaHeaders: { include: false },
                };
            case 'alignedAminoAcidSequences':
                return {
                    type: downloadFormState.dataType,
                    gene: downloadFormState.alignedAminoAcidSequence,
                    richFastaHeaders: { include: false },
                };
        }
    };

    return {
        dataType: assembleDownloadDataType(),
        includeRestricted: downloadFormState.includeRestricted,
        compression: downloadFormState.compression,
        dataFormat: undefined,
    };
}

// Sort fields by their order in the search table and ensure accessionVersion is the first field
function orderFieldsForDownload(fields: string[], metadata: Metadata[]): string[] {
    const fieldsWithoutAccessionVersion = fields.filter((field) => field !== ACCESSION_VERSION_FIELD);
    const orderMap = new Map<string, number>();
    for (const m of metadata) {
        orderMap.set(m.name, m.order ?? Number.MAX_SAFE_INTEGER);
    }
    const ordered = fieldsWithoutAccessionVersion
        .slice()
        .sort((a, b) => (orderMap.get(a) ?? Number.MAX_SAFE_INTEGER) - (orderMap.get(b) ?? Number.MAX_SAFE_INTEGER));
    return [ACCESSION_VERSION_FIELD, ...ordered];
}
