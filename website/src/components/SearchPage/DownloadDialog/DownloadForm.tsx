import { type Dispatch, type FC, type SetStateAction, useMemo, useState } from 'react';

import type { DownloadDataType } from './DownloadDataType.ts';
import type { Compression } from './DownloadUrlGenerator.ts';
import { FieldSelectorButton } from './FieldSelector/FieldSelectorButton.tsx';
import { FieldSelectorModal } from './FieldSelector/FieldSelectorModal.tsx';
import { DropdownOptionBlock, type OptionBlockOption, RadioOptionBlock } from './OptionBlock.tsx';
import { routes } from '../../../routes/routes.ts';
import { ACCESSION_VERSION_FIELD } from '../../../settings.ts';
import type { Schema } from '../../../types/config.ts';
import type { ReferenceGenomesMap } from '../../../types/referencesGenomes.ts';
import type { MetadataVisibility } from '../../../utils/search.ts';
import {
    type GeneInfo,
    getMultiPathogenNucleotideSequenceNames,
    getMultiPathogenSequenceName,
    getSinglePathogenSequenceName,
    isMultiSegmented,
    type SegmentInfo,
} from '../../../utils/sequenceTypeHelpers.ts';
import { stillRequiresReferenceNameSelection } from '../stillRequiresReferenceNameSelection.tsx';

export type DownloadFormState = {
    includeRestricted: boolean;
    dataType: DownloadDataType['type'];
    compression: Compression;
    unalignedNucleotideSequence: string;
    alignedNucleotideSequence: string;
    alignedAminoAcidSequence: string;
    includeRichFastaHeaders: boolean;
};

type DownloadFormProps = {
    ReferenceGenomesMap: ReferenceGenomesMap;
    downloadFormState: DownloadFormState;
    setDownloadFormState: Dispatch<SetStateAction<DownloadFormState>>;
    allowSubmissionOfConsensusSequences: boolean;
    dataUseTermsEnabled: boolean;
    schema: Schema;
    downloadFieldVisibilities: Map<string, MetadataVisibility>;
    onSelectedFieldsChange: Dispatch<SetStateAction<Set<string>>>;
    richFastaHeaderFields: Schema['richFastaHeaderFields'];
    selectedReferenceName: string | null;
    suborganismIdentifierField: string | undefined;
};

export const DownloadForm: FC<DownloadFormProps> = ({
    ReferenceGenomesMap,
    downloadFormState,
    setDownloadFormState,
    allowSubmissionOfConsensusSequences,
    dataUseTermsEnabled,
    schema,
    downloadFieldVisibilities,
    onSelectedFieldsChange,
    richFastaHeaderFields,
    selectedReferenceName,
    suborganismIdentifierField,
}) => {
    const [isFieldSelectorOpen, setIsFieldSelectorOpen] = useState(false);
    const { nucleotideSequences, genes } = useMemo(
        () => getSequenceNames(ReferenceGenomesMap, selectedReferenceName),
        [ReferenceGenomesMap, selectedReferenceName],
    );

    const disableAlignedSequences = stillRequiresReferenceNameSelection(
        ReferenceGenomesMap,
        selectedReferenceName,
    );

    function getDataTypeOptions(): OptionBlockOption[] {
        const metadataOption = {
            label: (
                <div className='flex items-center gap-3'>
                    <span>Metadata</span>
                    <FieldSelectorButton
                        onClick={() => setIsFieldSelectorOpen(true)}
                        selectedFieldsCount={
                            Array.from(downloadFieldVisibilities.values()).filter((it) =>
                                it.isVisible(selectedReferenceName),
                            ).length
                        }
                        disabled={downloadFormState.dataType !== 'metadata'}
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
                            selected={nucleotideSequences.findIndex(
                                (info) => info.lapisName === downloadFormState.unalignedNucleotideSequence,
                            )}
                            onSelect={(value) =>
                                setDownloadFormState((previous) => ({
                                    ...previous,
                                    unalignedNucleotideSequence: nucleotideSequences[value].lapisName,
                                }))
                            }
                            disabled={downloadFormState.dataType !== 'unalignedNucleotideSequences'}
                        />
                    ) : undefined}
                    {richFastaHeaderFields && (
                        <RadioOptionBlock
                            name='richFastaHeaders'
                            title='FASTA header style'
                            options={[{ label: <>Accession</> }, { label: <>Display name</> }]}
                            selected={downloadFormState.includeRichFastaHeaders ? 1 : 0}
                            onSelect={(value) =>
                                setDownloadFormState((previous) => ({
                                    ...previous,
                                    includeRichFastaHeaders: value > 0,
                                }))
                            }
                            disabled={downloadFormState.dataType !== 'unalignedNucleotideSequences'}
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
                            selected={nucleotideSequences.findIndex(
                                (info) => info.lapisName === downloadFormState.alignedNucleotideSequence,
                            )}
                            onSelect={(value) =>
                                setDownloadFormState((previous) => ({
                                    ...previous,
                                    alignedNucleotideSequence: nucleotideSequences[value].lapisName,
                                }))
                            }
                            disabled={downloadFormState.dataType !== 'alignedNucleotideSequences'}
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
                            selected={genes.findIndex(
                                (info) => info.lapisName === downloadFormState.alignedAminoAcidSequence,
                            )}
                            onSelect={(value) =>
                                setDownloadFormState((previous) => ({
                                    ...previous,
                                    alignedAminoAcidSequence: genes[value].lapisName,
                                }))
                            }
                            disabled={downloadFormState.dataType !== 'alignedAminoAcidSequences'}
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
                    selected={downloadFormState.includeRestricted ? 1 : 0}
                    onSelect={(value) =>
                        setDownloadFormState((previous) => ({
                            ...previous,
                            includeRestricted: value > 0,
                        }))
                    }
                />
            )}
            <div className='flex-1 min-w-0'>
                <RadioOptionBlock
                    name='dataType'
                    title='Data type'
                    options={getDataTypeOptions()}
                    selected={dataTypeToOptionMap[downloadFormState.dataType]}
                    onSelect={(value) =>
                        setDownloadFormState((previous) => ({
                            ...previous,
                            dataType: optionToDataTypeMap[value],
                        }))
                    }
                />
                {disableAlignedSequences && suborganismIdentifierField !== undefined && (
                    <div className='text-sm text-gray-400 mt-4 max-w-60'>
                        Or select a reference with the search UI to enable download of aligned sequences.
                    </div>
                )}
            </div>

            <RadioOptionBlock
                name='compression'
                title='Compression'
                options={[{ label: <>None</> }, { label: <>Zstandard</> }, { label: <>Gzip</> }]}
                selected={mapCompressionToOption(downloadFormState.compression)}
                onSelect={(value) =>
                    setDownloadFormState((previous) => ({
                        ...previous,
                        compression: optionToCompressionMap[value],
                    }))
                }
            />

            <FieldSelectorModal
                isOpen={isFieldSelectorOpen}
                onClose={() => setIsFieldSelectorOpen(false)}
                schema={schema}
                downloadFieldVisibilities={downloadFieldVisibilities}
                onSelectedFieldsChange={onSelectedFieldsChange}
                selectedReferenceName={selectedReferenceName}
            />
        </div>
    );
};

export function getSequenceNames(
    referenceGenomesMap: ReferenceGenomesMap,
    selectedReferenceName: string | null,
): {
    nucleotideSequences: SegmentInfo[];
    genes: GeneInfo[];
    useMultiSegmentEndpoint: boolean;
    defaultFastaHeaderTemplate?: string;
} {
    const segments = Object.keys(referenceGenomesMap.segments);

    // Check if single reference mode
    const firstSegment = segments[0];
    const firstSegmentRefs = firstSegment ? referenceGenomesMap.segments[firstSegment].references : [];
    const isSingleReference = firstSegmentRefs.length === 1;

    if (isSingleReference && firstSegmentRefs.length > 0) {
        const referenceName = firstSegmentRefs[0];
        const segmentNames = segments;
        const allGenes: string[] = [];

        for (const segmentName of segments) {
            const segmentData = referenceGenomesMap.segments[segmentName];
            const genes = segmentData.genesByReference[referenceName] ?? [];
            allGenes.push(...genes);
        }

        return {
            nucleotideSequences: segmentNames.map(getSinglePathogenSequenceName),
            genes: allGenes.map(getSinglePathogenSequenceName),
            useMultiSegmentEndpoint: isMultiSegmented(segmentNames),
        };
    }

    if (selectedReferenceName === null) {
        return {
            nucleotideSequences: [],
            genes: [],
            useMultiSegmentEndpoint: false,
            defaultFastaHeaderTemplate: `{${ACCESSION_VERSION_FIELD}}`,
        };
    }

    // Multi-reference mode
    const segmentNames = segments;
    const allGenes: string[] = [];

    for (const segmentName of segments) {
        const segmentData = referenceGenomesMap.segments[segmentName];
        const genes = segmentData.genesByReference[selectedReferenceName] ?? [];
        allGenes.push(...genes);
    }

    return {
        nucleotideSequences: getMultiPathogenNucleotideSequenceNames(segmentNames, selectedReferenceName),
        genes: allGenes.map((name: string) => getMultiPathogenSequenceName(name, selectedReferenceName)),
        useMultiSegmentEndpoint: true,
    };
}

const optionToDataTypeMap: DownloadDataType['type'][] = [
    'metadata',
    'unalignedNucleotideSequences',
    'alignedNucleotideSequences',
    'alignedAminoAcidSequences',
];

const dataTypeToOptionMap = optionToDataTypeMap.reduce(
    (acc, value, index) => ({
        ...acc,
        [value]: index,
    }),
    {} as Record<DownloadDataType['type'], number>,
);

const optionToCompressionMap: Compression[] = [undefined, 'zstd', 'gzip'];

function mapCompressionToOption(compression: Compression) {
    return optionToCompressionMap.findIndex((it) => it === compression);
}
