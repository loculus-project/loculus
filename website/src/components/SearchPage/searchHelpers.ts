import { formatNumberWithDefaultLocale } from '../../utils/formatNumber.tsx';

export const buildSequenceCountText = (
    totalSequences: number | undefined,
    oldCount: number | null,
    initialCount: number,
) => {
    const sequenceCount = totalSequences ?? oldCount ?? initialCount;
    const formattedCount = formatNumberWithDefaultLocale(sequenceCount);
    const pluralSuffix = sequenceCount === 1 ? '' : 's';
    return `Search returned ${formattedCount} sequence${pluralSuffix}`;
};
