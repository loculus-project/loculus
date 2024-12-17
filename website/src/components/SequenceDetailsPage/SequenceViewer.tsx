import { noCase } from 'change-case';
import { type FC } from 'react';

import { getLapisUrl } from '../../config.ts';
import { lapisClientHooks } from '../../services/serviceHooks.ts';
import type { ClientConfig } from '../../types/runtimeConfig.ts';
import { type SequenceType } from '../../utils/sequenceTypeHelpers.ts';
import { FixedLengthTextViewer } from '../common/FixedLengthTextViewer.tsx';

const LINE_LENGTH = 100;

type Props = {
    organism: string;
    accessionVersion: string;
    clientConfig: ClientConfig;
    sequenceType: SequenceType;
    isMultiSegmented: boolean;
};

function useGetSequence(
    organism: string,
    accessionVersion: string,
    clientConfig: ClientConfig,
    sequenceType: SequenceType,
    isMultiSegmented: boolean,
) {
    return lapisClientHooks(getLapisUrl(clientConfig, organism)).utilityHooks.useGetSequence(
        accessionVersion,
        sequenceType,
        isMultiSegmented,
    );
}

export const SequencesViewer: FC<Props> = ({
    organism,
    accessionVersion,
    clientConfig,
    sequenceType,
    isMultiSegmented,
}) => {
    const { data, error, isLoading } = useGetSequence(
        organism,
        accessionVersion,
        clientConfig,
        sequenceType,
        isMultiSegmented,
    );
    if (error !== null) {
        return (
            <div className='text-error'>
                Failed to load {noCase(sequenceType.type)} sequence {sequenceType.name}: {JSON.stringify(error)}
            </div>
        );
    }

    if (isLoading || data === undefined) {
        return <span className='loading loading-spinner loading-lg' />;
    }

    if (data === null) {
        return <span className='text-gray-600 italic'>None</span>;
    }

    const header = '>' + data.name + (sequenceType.name === 'main' ? '' : `_${sequenceType.name}`);

    return (
        <div className='h-80 overflow-auto'>
            <FixedLengthTextViewer text={data.sequence} maxLineLength={LINE_LENGTH} header={header} />
        </div>
    );
};
