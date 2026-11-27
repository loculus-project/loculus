import { noCase } from 'change-case';
import { type FC } from 'react';

import { SequenceActionButtons } from './SequenceActionButtons.tsx';
import { useLapisQuery } from '../../../hooks/useLapis.ts';
import { getErrorMessage } from '../../../services/apiRequest.ts';
import type { SequenceEndpoint } from '../../../services/lapisApi.ts';
import { fastaEntries } from '../../../utils/parseFasta.ts';
import { isAlignedSequence, isUnalignedSequence, type SequenceType } from '../../../utils/sequenceTypeHelpers.ts';
import { FixedLengthTextViewer } from '../../common/FixedLengthTextViewer.tsx';
import { Spinner } from '../../common/Spinner';

const LINE_LENGTH = 100;

type Props = {
    organism: string;
    accessionVersion: string;
    sequenceType: SequenceType;
    useLapisMultiSegmentedEndpoint: boolean;
};

export const SequencesViewer: FC<Props> = ({
    organism,
    accessionVersion,
    sequenceType,
    useLapisMultiSegmentedEndpoint,
}) => {
    const { data, error, isLoading } = useSequence(
        organism,
        accessionVersion,
        sequenceType,
        useLapisMultiSegmentedEndpoint,
    );

    if (error !== null) {
        return (
            <div className='text-error'>
                Failed to load {noCase(sequenceType.type)} sequence {sequenceType.name.lapisName}:{' '}
                {getErrorMessage(error)}
            </div>
        );
    }

    if (isLoading || data === undefined) {
        return <Spinner size='lg' />;
    }

    if (data === null) {
        return <span className='text-gray-600 italic'>None</span>;
    }

    const sequenceName = data.name + (sequenceType.name.name === 'main' ? '' : `_${sequenceType.name.name}`);
    const header = '>' + sequenceName;

    return (
        <div className='relative'>
            <div className='absolute top-0 right-0 z-10'>
                <SequenceActionButtons sequenceName={sequenceName} sequence={data.sequence} />
            </div>
            <div className='h-80 overflow-auto'>
                <FixedLengthTextViewer text={data.sequence} maxLineLength={LINE_LENGTH} header={header} />
            </div>
        </div>
    );
};

function useSequence(
    organism: string,
    accessionVersion: string,
    sequenceType: SequenceType,
    useLapisMultiSegmentedEndpoint: boolean,
) {
    const { data, error, isLoading } = useLapisQuery(organism, 'sequencesFasta', {
        request: { accessionVersion },
        endpoint: sequenceEndpoint(sequenceType, useLapisMultiSegmentedEndpoint),
    });
    return parseSequenceResult(data, error, isLoading);
}

function sequenceEndpoint(sequenceType: SequenceType, isMultiSegmented: boolean): SequenceEndpoint {
    const name = sequenceType.name.lapisName;
    if (isUnalignedSequence(sequenceType)) {
        return { kind: 'unalignedNucleotide', name: isMultiSegmented ? name : undefined };
    }
    if (isAlignedSequence(sequenceType)) {
        return { kind: 'alignedNucleotide', name: isMultiSegmented ? name : undefined };
    }
    return { kind: 'alignedAminoAcid', name };
}

function parseSequenceResult(data: string | undefined, error: Error | null, isLoading: boolean) {
    if (data === undefined) {
        return { data, error, isLoading };
    }

    const parseResult = fastaEntries.safeParse(data);
    if (parseResult.success) {
        return {
            data: parseResult.data.length > 0 ? parseResult.data[0] : null,
            error,
            isLoading,
        };
    }
    return { data: undefined, error: parseResult.error, isLoading };
}
