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
    getMultiPathogenSequenceName,
    getSinglePathogenSequenceName,
    isMultiSegmented,
    type SegmentInfo,
    stillRequiresReferenceNameSelection,
} from '../../../utils/sequenceTypeHelpers.ts';

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
    referenceGenomesMap: ReferenceGenomesMap;
    downloadFormState: DownloadFormState;
    setDownloadFormState: Dispatch<SetStateAction<DownloadFormState>>;
    allowSubmissionOfConsensusSequences: boolean;
    dataUseTermsEnabled: boolean;
    schema: Schema;
    downloadFieldVisibilities: Map<string, MetadataVisibility>;
    onSelectedFieldsChange: Dispatch<SetStateAction<Set<string>>>;
    richFastaHeaderFields: Schema['richFastaHeaderFields'];
    selectedReferenceNames: Record<string, string | null>;
    referenceIdentifierField: string | undefined;
};

export const DownloadForm: FC<DownloadFormProps> = ({
    referenceGenomesMap,
    downloadFormState,
    setDownloadFormState,
    allowSubmissionOfConsensusSequences,
    dataUseTermsEnabled,
    schema,
    downloadFieldVisibilities,
    onSelectedFieldsChange,
    richFastaHeaderFields,
    selectedReferenceNames,
    referenceIdentifierField,
}) => {
    const [isFieldSelectorOpen, setIsFieldSelectorOpen] = useState(false);
    const { nucleotideSequences, genes } = useMemo(
        () => getSequenceNames(referenceGenomesMap, selectedReferenceNames),
        [referenceGenomesMap, selectedReferenceNames],
    );

    console.log(nucleotideSequences, genes);

    const disableAlignedSequences = stillRequiresReferenceNameSelection(selectedReferenceNames, referenceGenomesMap);

    function getDataTypeOptions(): OptionBlockOption[] {
        const metadataOption = {
            label: (
                <div className='flex items-center gap-3'>
                    <span>Metadata</span>
                    <FieldSelectorButton
                        onClick={() => setIsFieldSelectorOpen(true)}
                        selectedFieldsCount={
                            Array.from(downloadFieldVisibilities.values()).filter((it) =>
                                it.isVisible(selectedReferenceNames),
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
                subOptions: isMultiSegmented(genes) ? (
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
                ) : undefined,
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
                {disableAlignedSequences && referenceIdentifierField !== undefined && (
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
                selectedReferenceNames={selectedReferenceNames}
            />
        </div>
    );
};

export function getSequenceNames(
    referenceGenomesMap: ReferenceGenomesMap,
    selectedReferenceNames: Record<string, string | null>,
): {
    nucleotideSequences: SegmentInfo[];
    genes: GeneInfo[];
    useMultiSegmentEndpoint: boolean;
    defaultFastaHeaderTemplate?: string;
} {
    const segments = Object.keys(referenceGenomesMap);
    let lapisHasMultiSegments = segments.length > 1;
    const singleSegment = segments.length === 1;
    const segmentNames: SegmentInfo[] = [];
    const geneNames: GeneInfo[] = [];

    for (const segmentName of segments) {
        const segmentData = referenceGenomesMap[segmentName];
        const isMultiReference = Object.keys(segmentData).length > 1;
        if (!isMultiReference) {
            // Single reference for this segment
            const singleReferenceName = Object.keys(segmentData)[0];
            if (!singleSegment) {
                segmentNames.push(getSinglePathogenSequenceName(segmentName));
            }
            const genes = segmentData[singleReferenceName].genes ? segmentData[singleReferenceName].genes.map(getSinglePathogenSequenceName) : [];
            geneNames.push(...genes);
            continue;
        }
        const selectedReferenceName = selectedReferenceNames[segmentName];
        if (!selectedReferenceName) {
            return {
                nucleotideSequences: [],
                genes: [],
                useMultiSegmentEndpoint: false,
                defaultFastaHeaderTemplate: `{${ACCESSION_VERSION_FIELD}}`,
            };
        }
        lapisHasMultiSegments = true;
        segmentNames.push(getMultiPathogenSequenceName(segmentName, selectedReferenceName, singleSegment));
        const genes =
            segmentData[selectedReferenceName].genes ? segmentData[selectedReferenceName].genes.map((geneName) =>
                getMultiPathogenSequenceName(geneName, selectedReferenceName),
            ) : [];
        geneNames.push(...genes);
    }
    return {
        nucleotideSequences: segmentNames,
        genes: geneNames,
        useMultiSegmentEndpoint: lapisHasMultiSegments,
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
