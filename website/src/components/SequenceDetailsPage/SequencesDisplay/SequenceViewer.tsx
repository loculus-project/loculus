import { noCase } from 'change-case';
import { type FC } from 'react';

import { SequenceActionButtons } from './SequenceActionButtons.tsx';
import { getLapisUrl } from '../../../config.ts';
import { lapisClientHooks } from '../../../services/serviceHooks.ts';
import type { ClientConfig } from '../../../types/runtimeConfig.ts';
import { type SequenceType } from '../../../utils/sequenceTypeHelpers.ts';
import { FixedLengthTextViewer } from '../../common/FixedLengthTextViewer.tsx';

const LINE_LENGTH = 100;

type Props = {
    organism: string;
    accessionVersion: string;
    clientConfig: ClientConfig;
    sequenceType: SequenceType;
    useLapisMultiSegmentedEndpoint: boolean;
};

export const SequencesViewer: FC<Props> = ({
    organism,
    accessionVersion,
    clientConfig,
    sequenceType,
    useLapisMultiSegmentedEndpoint,
}) => {
    const { data, error, isLoading } = lapisClientHooks(getLapisUrl(clientConfig, organism)).useGetSequence(
        accessionVersion,
        sequenceType,
        useLapisMultiSegmentedEndpoint,
    );

    if (error !== null) {
        return (
            <div className='text-error'>
                Failed to load {noCase(sequenceType.type)} sequence {sequenceType.name.lapisName}:{' '}
                {JSON.stringify(error)}
            </div>
        );
    }

    if (isLoading || data === undefined) {
        return <span className='loading loading-spinner loading-lg' />;
    }

    if (data === null) {
        return <span className='text-gray-600 italic'>None</span>;
    }

    const header = '>' + data.name + (sequenceType.name.name === 'main' ? '' : `_${sequenceType.name.name}`);
    const sequenceName = data.name + (sequenceType.name.name === 'main' ? '' : `_${sequenceType.name.name}`);

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
