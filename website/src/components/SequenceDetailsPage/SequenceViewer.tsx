import { noCase } from 'change-case';
import { type FC, useMemo } from 'react';

import { lapisClientHooks } from '../../services/serviceHooks.ts';
import type { Config } from '../../types/config.ts';
import type { ClientConfig } from '../../types/runtimeConfig.ts';
import { isUnalignedSequence, type SequenceType } from '../../utils/sequenceTypeHelpers.ts';
import { splitString } from '../../utils/splitLines';

const LINE_LENGTH = 100;

type Props = {
    sequenceVersion: string;
    config: Config;
    clientConfig: ClientConfig;
    sequenceType: SequenceType;
};

export const SequencesViewer: FC<Props> = ({ sequenceVersion, config, clientConfig, sequenceType }) => {
    const { data, error, isLoading } = lapisClientHooks(clientConfig).utilityHooks.useGetSequence(
        sequenceVersion,
        sequenceType,
        config,
    );

    const lines = useMemo(() => (data !== undefined ? splitString(data.sequence, LINE_LENGTH) : undefined), [data]);

    if (isUnalignedSequence(sequenceType)) {
        return <div className='text-error'>LAPIS v2 doesn't support unaligned nucleotide sequences yet</div>;
    }

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
