import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { type FC, useState } from 'react';

import { SequencesViewer } from './SequenceViewer';
import type { ClientConfig } from '../../types/runtimeConfig';
import {
    alignedSequenceSegment,
    geneSequence,
    isAlignedSequence,
    isGeneSequence,
    isUnalignedSequence,
    type SequenceType,
    unalignedSequenceSegment,
} from '../../utils/sequenceTypeHelpers';

const queryClient = new QueryClient();

type SequenceContainerProps = {
    organism: string;
    accessionVersion: string;
    clientConfig: ClientConfig;
    genes: string[];
    nucleotideSegmentNames: [string, ...string[]];
};

export const SequencesContainer: FC<SequenceContainerProps> = ({
    organism,
    accessionVersion,
    clientConfig,
    genes,
    nucleotideSegmentNames,
}) => {
    const [loadSequences, setLoadSequences] = useState(false);
    const [type, setType] = useState<SequenceType>(unalignedSequenceSegment(nucleotideSegmentNames[0]));

    return (
        <QueryClientProvider client={queryClient}>
            {!loadSequences ? (
                <button className='btn btn-sm m-4' onClick={() => setLoadSequences(true)}>
                    Load sequences
                </button>
            ) : (
                <>
                    <div className='tabs -mb-px tabs-lifted flex flex-wrap'>
                        {nucleotideSegmentNames.map((segmentName) => (
                            <button
                                key={segmentName}
                                className={`tab ${isUnalignedSequence(type) ? 'tab-active' : ''}`}
                                onClick={() => setType(unalignedSequenceSegment(segmentName))}
                            >
                                {segmentName} (unaligned)
                            </button>
                        ))}
                        {nucleotideSegmentNames.map((segmentName) => (
                            <button
                                key={segmentName}
                                className={`tab ${isAlignedSequence(type) ? 'tab-active' : ''}`}
                                onClick={() => setType(alignedSequenceSegment(segmentName))}
                            >
                                {segmentName} (aligned)
                            </button>
                        ))}
                        {genes.map((gene) => (
                            <button
                                key={gene}
                                className={`tab ${isGeneSequence(gene, type) ? 'tab-active' : ''}`}
                                onClick={() => setType(geneSequence(gene))}
                            >
                                {gene}
                            </button>
                        ))}
                    </div>

                    <div className='border p-4 max-w-[1000px]'>
                        <SequencesViewer
                            organism={organism}
                            accessionVersion={accessionVersion}
                            clientConfig={clientConfig}
                            sequenceType={type}
                            isMultiSegmented={nucleotideSegmentNames.length > 1}
                        />
                    </div>
                </>
            )}
        </QueryClientProvider>
    );
};
