import { type FC, useEffect, useMemo, useState } from 'react';

import { DownloadDialogButton } from './DowloadDialogButton.tsx';
import { DownloadButton } from './DownloadButton.tsx';
import type { DownloadDataType } from './DownloadDataType.ts';
import { DownloadForm, type DownloadFormState, getSequenceNames } from './DownloadForm.tsx';
import { type DownloadOption, type DownloadUrlGenerator } from './DownloadUrlGenerator.ts';
import { getDefaultSelectedFields } from './FieldSelector/FieldSelectorModal.tsx';
import type { SequenceFilter } from './SequenceFilters.tsx';
import { routes } from '../../../routes/routes.ts';
import { ACCESSION_VERSION_FIELD } from '../../../settings.ts';
import type { Metadata, Schema } from '../../../types/config.ts';
import type { ReferenceGenomesMap } from '../../../types/referencesGenomes.ts';
import { MetadataVisibility } from '../../../utils/search.ts';
import type { GeneInfo, SegmentInfo } from '../../../utils/sequenceTypeHelpers.ts';
import { ActiveFilters } from '../../common/ActiveFilters.tsx';
import { BaseDialog } from '../../common/BaseDialog.tsx';

type DownloadDialogProps = {
    downloadUrlGenerator: DownloadUrlGenerator;
    sequenceFilter: SequenceFilter;
    ReferenceGenomesMap: ReferenceGenomesMap;
    allowSubmissionOfConsensusSequences: boolean;
    dataUseTermsEnabled: boolean;
    schema: Schema;
    richFastaHeaderFields: Schema['richFastaHeaderFields'];
    selectedReferenceName: string | null;
    referenceIdentifierField: string | undefined;
};

export const DownloadDialog: FC<DownloadDialogProps> = ({
    downloadUrlGenerator,
    sequenceFilter,
    ReferenceGenomesMap,
    allowSubmissionOfConsensusSequences,
    dataUseTermsEnabled,
    schema,
    richFastaHeaderFields,
    selectedReferenceName,
    referenceIdentifierField,
}) => {
    const [isOpen, setIsOpen] = useState(false);

    const openDialog = () => setIsOpen(true);
    const closeDialog = () => setIsOpen(false);

    const { nucleotideSequences, genes, useMultiSegmentEndpoint, defaultFastaHeaderTemplate } = useMemo(
        () => getSequenceNames(ReferenceGenomesMap, selectedReferenceName),
        [ReferenceGenomesMap, selectedReferenceName],
    );

    const [downloadFormState, setDownloadFormState] = useState<DownloadFormState>(
        getDefaultDownloadFormState(nucleotideSequences, genes),
    );
    useEffect(() => {
        setDownloadFormState(getDefaultDownloadFormState(nucleotideSequences, genes));
    }, [nucleotideSequences, genes]);

    const [agreedToDataUseTerms, setAgreedToDataUseTerms] = useState(dataUseTermsEnabled ? false : true);
    const [selectedFields, setSelectedFields] = useState<Set<string>>(getDefaultSelectedFields(schema.metadata)); // This is here so that the state is persisted across closing and reopening the dialog

    const downloadFieldVisibilities = useMemo(() => {
        return new Map(
            schema.metadata.map((field) => [
                field.name,
                new MetadataVisibility(selectedFields.has(field.name), field.onlyForReferenceName),
            ]),
        );
    }, [selectedFields, schema]);

    const downloadOption = getDownloadOption({
        downloadFormState,
        nucleotideSequences,
        genes,
        useMultiSegmentEndpoint,
        defaultFastaHeaderTemplate,
        getVisibleFields: () => [
            ...Array.from(downloadFieldVisibilities.entries())
                .filter(([_, visibility]) => visibility.isVisible(selectedReferenceName))
                .map(([name]) => name),
        ],
        metadata: schema.metadata,
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
                        ReferenceGenomesMap={ReferenceGenomesMap}
                        downloadFormState={downloadFormState}
                        setDownloadFormState={setDownloadFormState}
                        allowSubmissionOfConsensusSequences={allowSubmissionOfConsensusSequences}
                        dataUseTermsEnabled={dataUseTermsEnabled}
                        schema={schema}
                        downloadFieldVisibilities={downloadFieldVisibilities}
                        onSelectedFieldsChange={setSelectedFields}
                        richFastaHeaderFields={richFastaHeaderFields}
                        selectedReferenceName={selectedReferenceName}
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

function getDefaultDownloadFormState(nucleotideSequences: SegmentInfo[], genes: GeneInfo[]): DownloadFormState {
    return {
        includeRestricted: false,
        dataType: 'metadata',
        compression: undefined,
        unalignedNucleotideSequence: nucleotideSequences[0]?.lapisName ?? '',
        alignedNucleotideSequence: nucleotideSequences[0]?.lapisName ?? '',
        alignedAminoAcidSequence: genes[0]?.lapisName ?? '',
        includeRichFastaHeaders: false,
    };
}

function getDownloadOption({
    downloadFormState,
    useMultiSegmentEndpoint,
    defaultFastaHeaderTemplate,
    getVisibleFields,
    metadata,
}: {
    downloadFormState: DownloadFormState;
    nucleotideSequences: SegmentInfo[];
    genes: GeneInfo[];
    useMultiSegmentEndpoint: boolean;
    defaultFastaHeaderTemplate: string | undefined;
    getVisibleFields: () => string[];
    metadata: Metadata[];
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
