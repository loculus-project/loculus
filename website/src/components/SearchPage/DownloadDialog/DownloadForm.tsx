import { type FC, useEffect, useMemo, useState } from 'react';

import type { DownloadDataType } from './DownloadDataType.ts';
import type { DownloadOption } from './DownloadUrlGenerator.ts';
import { FieldSelectorButton } from './FieldSelector/FieldSelectorButton.tsx';
import { FieldSelectorModal } from './FieldSelector/FieldSelectorModal.tsx';
import { DropdownOptionBlock, type OptionBlockOption, RadioOptionBlock } from './OptionBlock.tsx';
import { routes } from '../../../routes/routes.ts';
import { ACCESSION_VERSION_FIELD } from '../../../settings.ts';
import type { Metadata, Schema } from '../../../types/config.ts';
import { type ReferenceGenomesLightweightSchema, SINGLE_REFERENCE } from '../../../types/referencesGenomes.ts';
import {
    type GeneInfo,
    getMultiPathogenNucleotideSequenceNames,
    getMultiPathogenSequenceName,
    getSinglePathogenSequenceName,
    isMultiSegmented,
    type SegmentInfo,
} from '../../../utils/sequenceTypeHelpers.ts';
import { formatLabel } from '../SuborganismSelector.tsx';
import { stillRequiresSuborganismSelection } from '../stillRequiresSuborganismSelection.tsx';

type DownloadFormProps = {
    referenceGenomesLightweightSchema: ReferenceGenomesLightweightSchema;
    onChange: (value: DownloadOption) => void;
    allowSubmissionOfConsensusSequences: boolean;
    dataUseTermsEnabled: boolean;
    metadata: Metadata[];
    selectedFields: string[];
    onSelectedFieldsChange: (fields: string[]) => void;
    richFastaHeaderFields: Schema['richFastaHeaderFields'];
    selectedSuborganism: string | null;
    suborganismIdentifierField: string | undefined;
};

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

export const DownloadForm: FC<DownloadFormProps> = ({
    referenceGenomesLightweightSchema,
    onChange,
    allowSubmissionOfConsensusSequences,
    dataUseTermsEnabled,
    metadata,
    selectedFields,
    onSelectedFieldsChange,
    richFastaHeaderFields,
    selectedSuborganism,
    suborganismIdentifierField,
}) => {
    const [includeRestricted, setIncludeRestricted] = useState(0);
    const [dataType, setDataType] = useState(0);
    const [compression, setCompression] = useState(0);
    const [unalignedNucleotideSequence, setUnalignedNucleotideSequence] = useState(0);
    const [alignedNucleotideSequence, setAlignedNucleotideSequence] = useState(0);
    const [alignedAminoAcidSequence, setAlignedAminoAcidSequence] = useState(0);
    const [includeRichFastaHeaders, setIncludeRichFastaHeaders] = useState(0);

    const [isFieldSelectorOpen, setIsFieldSelectorOpen] = useState(false);
    const { nucleotideSequences, genes, useMultiSegmentEndpoint, defaultFastaHeaderTemplate } = useMemo(
        () => getSequenceNames(referenceGenomesLightweightSchema, selectedSuborganism),
        [referenceGenomesLightweightSchema, selectedSuborganism],
    );

    useEffect(() => {
        let downloadDataType: DownloadDataType;
        switch (dataType) {
            case 0:
                downloadDataType = { type: 'metadata' };
                break;
            case 1:
                downloadDataType = {
                    type: 'unalignedNucleotideSequences',
                    segment: useMultiSegmentEndpoint
                        ? nucleotideSequences[unalignedNucleotideSequence].lapisName
                        : undefined,
                    richFastaHeaders:
                        defaultFastaHeaderTemplate !== undefined
                            ? { include: true, fastaHeaderOverride: defaultFastaHeaderTemplate }
                            : { include: includeRichFastaHeaders === 1 },
                };
                break;
            case 2:
                downloadDataType = {
                    type: 'alignedNucleotideSequences',
                    segment: useMultiSegmentEndpoint
                        ? nucleotideSequences[alignedNucleotideSequence].lapisName
                        : undefined,
                    richFastaHeaders: { include: false },
                };
                break;
            case 3:
                downloadDataType = {
                    type: 'alignedAminoAcidSequences',
                    gene: genes[alignedAminoAcidSequence].lapisName,
                    richFastaHeaders: { include: false },
                };
                break;
            default:
                throw new Error(`Invalid state error: DownloadForm dataType=${dataType}`);
        }
        const compressionOptions = [undefined, 'zstd', 'gzip'] as const;
        onChange({
            dataType: downloadDataType,
            includeRestricted: includeRestricted === 1,
            fields: dataType === 0 ? orderFieldsForDownload(selectedFields, metadata) : undefined,
            compression: compressionOptions[compression],
            dataFormat: undefined,
        });
    }, [
        includeRestricted,
        compression,
        dataType,
        unalignedNucleotideSequence,
        alignedNucleotideSequence,
        alignedAminoAcidSequence,
        includeRichFastaHeaders,
        useMultiSegmentEndpoint,
        nucleotideSequences,
        genes,
        onChange,
        selectedFields,
    ]);

    const disableAlignedSequences = stillRequiresSuborganismSelection(
        referenceGenomesLightweightSchema,
        selectedSuborganism,
    );

    function getDataTypeOptions(): OptionBlockOption[] {
        const metadataOption = {
            label: (
                <div className='flex items-center gap-3'>
                    <span>Metadata</span>
                    <FieldSelectorButton
                        onClick={() => setIsFieldSelectorOpen(true)}
                        selectedFieldsCount={selectedFields.length}
                        disabled={dataType !== 0}
                    />
                </div>
            ),
        };

        const rawNucleotideSequencesOption = {
            label: <>Raw nucleotide sequences</>,
            subOptions: (
                <div className='px-8'>
                    {isMultiSegmented(nucleotideSequences) ? (
                        <DropdownOptionBlock
                            name='unalignedNucleotideSequences'
                            options={nucleotideSequences.map((segment) => ({
                                label: <>{segment.label}</>,
                            }))}
                            selected={unalignedNucleotideSequence}
                            onSelect={setUnalignedNucleotideSequence}
                            disabled={dataType !== 1}
                        />
                    ) : undefined}
                    {richFastaHeaderFields && (
                        <RadioOptionBlock
                            name='richFastaHeaders'
                            title='FASTA header style'
                            options={[{ label: <>Accession</> }, { label: <>Display name</> }]}
                            selected={includeRichFastaHeaders}
                            onSelect={setIncludeRichFastaHeaders}
                            disabled={dataType !== 1}
                            variant='nested'
                        />
                    )}
                </div>
            ),
        };

        if (!allowSubmissionOfConsensusSequences) {
            return [metadataOption];
        }

        if (disableAlignedSequences) {
            return [metadataOption, rawNucleotideSequencesOption];
        }

        return [
            metadataOption,
            rawNucleotideSequencesOption,
            {
                label: <>Aligned nucleotide sequences</>,
                subOptions: isMultiSegmented(nucleotideSequences) ? (
                    <div className='px-8'>
                        <DropdownOptionBlock
                            name='alignedNucleotideSequences'
                            options={nucleotideSequences.map((segment) => ({
                                label: <>{segment.label}</>,
                            }))}
                            selected={alignedNucleotideSequence}
                            onSelect={setAlignedNucleotideSequence}
                            disabled={dataType !== 2}
                        />
                    </div>
                ) : undefined,
            },
            {
                label: <>Aligned amino acid sequences</>,
                subOptions: (
                    <div className='px-8'>
                        <DropdownOptionBlock
                            name='alignedAminoAcidSequences'
                            options={genes.map((gene) => ({
                                label: <>{gene.label}</>,
                            }))}
                            selected={alignedAminoAcidSequence}
                            onSelect={setAlignedAminoAcidSequence}
                            disabled={dataType !== 3}
                        />
                    </div>
                ),
            },
        ];
    }

    return (
        <div className='flex flex-row flex-wrap mb-4 gap-y-2 py-4'>
            {dataUseTermsEnabled && (
                <RadioOptionBlock
                    name='includeRestricted'
                    title='Include restricted data?'
                    options={[
                        { label: <>No, only download open data</> },
                        {
                            label: (
                                <>
                                    Yes, include restricted data
                                    <br />(
                                    <a href={routes.datauseTermsPage()} className='underline'>
                                        What does it mean?
                                    </a>
                                    )
                                </>
                            ),
                        },
                    ]}
                    selected={includeRestricted}
                    onSelect={setIncludeRestricted}
                />
            )}
            <div className='flex-1 min-w-0'>
                <RadioOptionBlock
                    name='dataType'
                    title='Data type'
                    options={getDataTypeOptions()}
                    selected={dataType}
                    onSelect={setDataType}
                />
                {disableAlignedSequences && suborganismIdentifierField !== undefined && (
                    <div className='text-sm text-gray-400 mt-4 max-w-60'>
                        Or select a {formatLabel(suborganismIdentifierField)} with the search UI to enable download of
                        aligned sequences.
                    </div>
                )}
            </div>

            <RadioOptionBlock
                name='compression'
                title='Compression'
                options={[{ label: <>None</> }, { label: <>Zstandard</> }, { label: <>Gzip</> }]}
                selected={compression}
                onSelect={setCompression}
            />

            <FieldSelectorModal
                isOpen={isFieldSelectorOpen}
                onClose={() => setIsFieldSelectorOpen(false)}
                metadata={metadata}
                initialSelectedFields={selectedFields}
                onSave={onSelectedFieldsChange}
            />
        </div>
    );
};

function getSequenceNames(
    referenceGenomeLightweightSchema: ReferenceGenomesLightweightSchema,
    selectedSuborganism: string | null,
): {
    nucleotideSequences: SegmentInfo[];
    genes: GeneInfo[];
    useMultiSegmentEndpoint: boolean;
    defaultFastaHeaderTemplate?: string;
} {
    if (SINGLE_REFERENCE in referenceGenomeLightweightSchema) {
        const { nucleotideSegmentNames, geneNames } = referenceGenomeLightweightSchema[SINGLE_REFERENCE];
        return {
            nucleotideSequences: nucleotideSegmentNames.map(getSinglePathogenSequenceName),
            genes: geneNames.map(getSinglePathogenSequenceName),
            useMultiSegmentEndpoint: isMultiSegmented(nucleotideSegmentNames),
        };
    }

    if (selectedSuborganism === null) {
        return {
            nucleotideSequences: [],
            genes: [],
            useMultiSegmentEndpoint: false, // When no suborganism is selected, use the "all segments" endpoint to download all available segments, even though LAPIS is multisegmented. That endpoint is available at the same route as the single segmented endpoint.
            defaultFastaHeaderTemplate: `{${ACCESSION_VERSION_FIELD}}`, // make sure that the segment does not appear in the fasta header
        };
    }

    const { nucleotideSegmentNames, geneNames } = referenceGenomeLightweightSchema[selectedSuborganism];
    return {
        nucleotideSequences: getMultiPathogenNucleotideSequenceNames(nucleotideSegmentNames, selectedSuborganism),
        genes: geneNames.map((name) => getMultiPathogenSequenceName(name, selectedSuborganism)),
        useMultiSegmentEndpoint: true,
    };
}
