import { useQuery } from '@tanstack/react-query';
import { noCase } from 'change-case';
import { type FC, useMemo } from 'react';

import { fetchSequence } from '../../api';
import type { ClientConfig, Config, SequenceType } from '../../types';
import { splitString } from '../../utils/splitLines';

const LINE_LENGTH = 100;

type Props = {
    accession: string;
    config: Config;
    clientConfig: ClientConfig;
    sequenceType: SequenceType;
};

export const SequencesViewer: FC<Props> = ({ accession, config, clientConfig, sequenceType }) => {
    const { isLoading, data, error } = useQuery({
        queryKey: [accession, sequenceType],
        queryFn: () => fetchSequence(accession, sequenceType, config, clientConfig),
    });

    const lines = useMemo(() => (data !== undefined ? splitString(data, LINE_LENGTH) : undefined), [data]);

    if (error !== null) {
        return (
            <div className='text-error'>
                Failed to load {noCase(sequenceType.type)} sequence {sequenceType.name}: {JSON.stringify(error)}
            </div>
        );
    }

    if (isLoading || lines === undefined) {
        return <span className='loading loading-spinner loading-lg' />;
    }

    return (
        <div className='overflow-x-auto'>
            {lines.map((line, index) => (
                <pre
                    key={index}
                    className='inline-block before:content-[attr(data-line)] before:inline-block before:w-12
                    before:mr-2 before:text-right before:text-gray-500'
                    data-line={index * LINE_LENGTH}
                >
                    <code>{line}</code>
                </pre>
            ))}
        </div>
    );
};
