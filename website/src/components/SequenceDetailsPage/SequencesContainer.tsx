import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { type FC, useState } from 'react';

import { SequencesViewer } from './SequenceViewer';
import type { Schema } from '../../types/config.ts';
import type { ClientConfig } from '../../types/runtimeConfig';
import {
    alignedSequence,
    geneSequence,
    isAlignedSequence,
    isGeneSequence,
    isUnalignedSequence,
    type SequenceType,
    unalignedSequence,
} from '../../utils/sequenceTypeHelpers';

const queryClient = new QueryClient();

type SequenceContainerProps = {
    organism: string;
    accessionVersion: string;
    schema: Schema;
    clientConfig: ClientConfig;
    genes: string[];
};

export const SequencesContainer: FC<SequenceContainerProps> = ({
    organism,
    accessionVersion,
    schema,
    clientConfig,
    genes,
}) => {
    const [loadSequences, setLoadSequences] = useState(false);
    const [type, setType] = useState<SequenceType>(unalignedSequence);

    return (
        <QueryClientProvider client={queryClient}>
            {!loadSequences ? (
                <button className='btn btn-sm m-4' onClick={() => setLoadSequences(true)}>
                    Load sequences
                </button>
            ) : (
                <>
                    <div className='tabs -mb-px tabs-lifted flex flex-wrap'>
                        <button
                            className={`tab  ${isUnalignedSequence(type) ? 'tab-active' : ''}`}
                            onClick={() => setType(unalignedSequence)}
                        >
                            Sequence
                        </button>
                        <button
                            className={`tab ${isAlignedSequence(type) ? 'tab-active' : ''}`}
                            onClick={() => setType(alignedSequence)}
                        >
                            Aligned
                        </button>
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
                            schema={schema}
                            clientConfig={clientConfig}
                            sequenceType={type}
                        />
                    </div>
                </>
            )}
        </QueryClientProvider>
    );
};
