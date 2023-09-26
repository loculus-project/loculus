import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { type FC, useState } from 'react';

import { SequencesViewer } from './SequenceViewer';
import type { Config, RuntimeConfig, SequenceType } from '../../types';
import {
    alignedSequence,
    geneSequence,
    isAlignedSequence,
    isGeneSequence,
    isUnalignedSequence,
    unalignedSequence,
} from '../../utils/sequenceTypeHelpers';

const queryClient = new QueryClient();

type Props = {
    accession: string;
    config: Config;
    runtimeConfig: RuntimeConfig;
    genes: string[];
};

export const SequencesContainer: FC<Props> = ({ accession, config, runtimeConfig, genes }) => {
    const [loadSequences, setLoadSequences] = useState(false);
    const [type, setType] = useState<SequenceType>(unalignedSequence);

    return (
        <QueryClientProvider client={queryClient}>
            <div className='tabs -mb-px'>
                <button
                    className={`tab tab-lifted ${isUnalignedSequence(type) ? 'tab-active' : ''}`}
                    onClick={() => setType(unalignedSequence)}
                >
                    Sequence
                </button>
                <button
                    className={`tab tab-lifted ${isAlignedSequence(type) ? 'tab-active' : ''}`}
                    onClick={() => setType(alignedSequence)}
                >
                    Aligned
                </button>
                {genes.map((gene) => (
                    <button
                        key={gene}
                        className={`tab tab-lifted ${isGeneSequence(gene, type) ? 'tab-active' : ''}`}
                        onClick={() => setType(geneSequence(gene))}
                    >
                        {gene}
                    </button>
                ))}
            </div>
            <div className='border p-4 max-w-[1000px]'>
                {!loadSequences && (
                    <button className='btn btn-sm m-4' onClick={() => setLoadSequences(true)}>
                        Load sequences
                    </button>
                )}
                {loadSequences && (
                    <SequencesViewer
                        accession={accession}
                        config={config}
                        runtimeConfig={runtimeConfig}
                        sequenceType={type}
                    />
                )}
            </div>
        </QueryClientProvider>
    );
};
