import { type FC, useEffect, useState } from 'react';

import type { DownloadDataType } from './DownloadDataType.ts';
import type { DownloadOption } from './DownloadUrlGenerator.ts';
import { DropdownOptionBlock, RadioOptionBlock } from './OptionBlock.tsx';
import { routes } from '../../../routes/routes.ts';
import type { ReferenceGenomesSequenceNames } from '../../../types/referencesGenomes.ts';

type DownloadFormProps = {
    referenceGenomesSequenceNames: ReferenceGenomesSequenceNames;
    onChange: (value: DownloadOption) => void;
};

export const DownloadForm: FC<DownloadFormProps> = ({ referenceGenomesSequenceNames, onChange }) => {
    const [includeRestricted, setIncludeRestricted] = useState(0);
    const [includeOldData, setIncludeOldData] = useState(0);
    const [dataType, setDataType] = useState(0);
    const [compression, setCompression] = useState(0);
    const [unalignedNucleotideSequence, setUnalignedNucleotideSequence] = useState(0);
    const [alignedNucleotideSequence, setAlignedNucleotideSequence] = useState(0);
    const [alignedAminoAcidSequence, setAlignedAminoAcidSequence] = useState(0);

    const isMultiSegmented = referenceGenomesSequenceNames.nucleotideSequences.length > 1;

    useEffect(() => {
        let downloadDataType: DownloadDataType;
        switch (dataType) {
            case 0:
                downloadDataType = { type: 'metadata' };
                break;
            case 1:
                downloadDataType = {
                    type: 'unalignedNucleotideSequences',
                    segment: isMultiSegmented
                        ? referenceGenomesSequenceNames.nucleotideSequences[unalignedNucleotideSequence]
                        : undefined,
                };
                break;
            case 2:
                downloadDataType = {
                    type: 'alignedNucleotideSequences',
                    segment: isMultiSegmented
                        ? referenceGenomesSequenceNames.nucleotideSequences[alignedNucleotideSequence]
                        : undefined,
                };
                break;
            case 3:
                downloadDataType = {
                    type: 'alignedAminoAcidSequences',
                    gene: referenceGenomesSequenceNames.genes[alignedAminoAcidSequence],
                };
                break;
            default:
                throw new Error(`Invalid state error: DownloadForm dataType=${dataType}`);
        }
        const compressionOptions = [undefined, 'zstd', 'gzip'] as const;
        onChange({
            dataType: downloadDataType,
            includeOldData: includeOldData === 1,
            includeRestricted: includeRestricted === 1,
            compression: compressionOptions[compression],
        });
    }, [
        includeRestricted,
        includeOldData,
        compression,
        dataType,
        unalignedNucleotideSequence,
        alignedNucleotideSequence,
        alignedAminoAcidSequence,
        isMultiSegmented,
        referenceGenomesSequenceNames.nucleotideSequences,
        referenceGenomesSequenceNames.genes,
        onChange,
    ]);

    return (
        <div className='flex flex-row flex-wrap mb-4 justify-between'>
            <RadioOptionBlock
                name='includeRestricted'
                title='Include restricted data?'
                options={[
                    { label: <>No, only download open data</> },
                    {
                        label: (
                            <>
                                Yes, include restricted data
                                <br />({/* TODO(862) */}
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
            <RadioOptionBlock
                name='includeOlder'
                title='Include older versions?'
                options={[
                    { label: <>No, only download latest version</> },
                    { label: <>Yes, include older versions and revoked sequences</> },
                ]}
                selected={includeOldData}
                onSelect={setIncludeOldData}
            />
            <RadioOptionBlock
                name='dataType'
                title='Data Type'
                options={[
                    { label: <>Metadata</> },
                    {
                        label: <>Raw nucleotide sequences</>,
                        subOptions: isMultiSegmented ? (
                            <div className='px-8'>
                                <DropdownOptionBlock
                                    name='unalignedNucleotideSequences'
                                    options={referenceGenomesSequenceNames.nucleotideSequences.map((segment) => ({
                                        // eslint-disable-next-line react/jsx-no-useless-fragment
                                        label: <>{segment}</>,
                                    }))}
                                    selected={unalignedNucleotideSequence}
                                    onSelect={setUnalignedNucleotideSequence}
                                    disabled={dataType !== 1}
                                />
                            </div>
                        ) : undefined,
                    },
                    {
                        label: <>Aligned nucleotide sequences</>,
                        subOptions: isMultiSegmented ? (
                            <div className='px-8'>
                                <DropdownOptionBlock
                                    name='alignedNucleotideSequences'
                                    options={referenceGenomesSequenceNames.nucleotideSequences.map((gene) => ({
                                        // eslint-disable-next-line react/jsx-no-useless-fragment
                                        label: <>{gene}</>,
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
                                    options={referenceGenomesSequenceNames.genes.map((gene) => ({
                                        // eslint-disable-next-line react/jsx-no-useless-fragment
                                        label: <>{gene}</>,
                                    }))}
                                    selected={alignedAminoAcidSequence}
                                    onSelect={setAlignedAminoAcidSequence}
                                    disabled={dataType !== 3}
                                />
                            </div>
                        ),
                    },
                ]}
                selected={dataType}
                onSelect={setDataType}
            />
            <RadioOptionBlock
                name='compression'
                title='Compression'
                options={[{ label: <>None</> }, { label: <>Zstandard</> }, { label: <>Gzip</> }]}
                selected={compression}
                onSelect={setCompression}
            />
        </div>
    );
};
