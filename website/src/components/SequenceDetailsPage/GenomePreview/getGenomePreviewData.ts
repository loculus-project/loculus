import { getReferenceGenbank } from './referenceGenbank';
import type { GenomePreviewData } from './types';
import type { LapisClient } from '../../../services/lapisClient';
import type { InsertionCount } from '../../../types/lapis';
import type { ReferenceGenomesSchema } from '../../../types/referencesGenomes';
import { parseFasta } from '../../../utils/parseFasta';
import {
    getSegmentAndGeneInfo,
    toReferenceGenomes,
    type SegmentReferenceSelections,
} from '../../../utils/sequenceTypeHelpers';

export function previewReference(
    references: ReferenceGenomesSchema,
    selections: SegmentReferenceSelections | undefined,
    segmentName: string,
) {
    const segment = references?.find(({ name }) => name === segmentName);
    const selected = selections?.[segmentName];
    return segment?.references.length === 1
        ? segment.references[0]
        : segment?.references.find(({ name }) => name === selected);
}

export function previewInsertions(insertions: InsertionCount[], lapisName: string, multiSegmented: boolean) {
    return insertions
        .filter(({ sequenceName }) => sequenceName === lapisName || (!multiSegmented && sequenceName === null))
        .map(({ position, insertedSymbols }) => ({ position, sequence: insertedSymbols }));
}

export async function getGenomePreviewData({
    accessionVersion,
    segmentName,
    references,
    selections,
    primaryKey,
    client,
}: {
    accessionVersion: string;
    segmentName: string;
    references: ReferenceGenomesSchema;
    selections: SegmentReferenceSelections | undefined;
    primaryKey: string;
    client: LapisClient;
}): Promise<GenomePreviewData> {
    const reference = previewReference(references, selections, segmentName);
    const info = toReferenceGenomes(references);
    const segment = getSegmentAndGeneInfo(info, selections).nucleotideSegmentInfos.find(
        ({ name }) => name === segmentName,
    );
    if (reference === undefined || segment === undefined) throw new Error('No reference is assigned to this segment.');
    const request = { [primaryKey]: accessionVersion, dataFormat: 'FASTA' as const };
    const [aligned, insertions] = await Promise.all([
        info.useLapisMultiSegmentedEndpoint
            ? client.call('alignedNucleotideSequencesMultiSegment', request, { params: { segment: segment.lapisName } })
            : client.call('alignedNucleotideSequences', request),
        client.getSequenceInsertions(accessionVersion, 'nucleotide'),
    ]);
    if (aligned.isErr() || insertions.isErr())
        throw new Error('The sequence data could not be loaded. Please try again.');
    const records = parseFasta(aligned.value);
    if (records.length !== 1 || records[0].sequence.length !== reference.sequence.replace(/\s/g, '').length)
        throw new Error('An alignment matching this reference is unavailable.');
    return {
        ...(await getReferenceGenbank(reference)),
        alignedSequence: {
            name: accessionVersion,
            sequence: records[0].sequence,
            insertions: previewInsertions(
                insertions.value.data,
                segment.lapisName,
                info.useLapisMultiSegmentedEndpoint,
            ),
        },
    };
}
