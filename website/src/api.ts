import { getConfig } from './config';
import type { SequenceType } from './types';
import { parseFasta } from './utils/parseFasta';
import { isAlignedSequence, isUnalignedSequence } from './utils/sequenceTypeHelpers';

export async function fetchNumberSequences(config = getConfig()): Promise<number> {
    const response = await fetch(`${config.lapisHost}/aggregated?country=Switzerland`);
    return (await response.json()).data[0].count;
}

export async function fetchSequenceList(config = getConfig()): Promise<any[]> {
    const response = await fetch(`${config.lapisHost}/details?fields=${config.schema.primaryKey}&country=Switzerland`);
    return (await response.json()).data;
}

export async function fetchSequenceDetails(accession: string, config = getConfig()): Promise<any> {
    const response = await fetch(`${config.lapisHost}/details?${config.schema.primaryKey}=${accession}`);
    return (await response.json()).data[0];
}

export async function fetchSequence(
    accession: string,
    sequenceType: SequenceType,
    config = getConfig(),
): Promise<string | null> {
    let endpoint: string;
    if (isUnalignedSequence(sequenceType)) {
        endpoint = 'nuc-sequence';
    } else if (isAlignedSequence(sequenceType)) {
        endpoint = 'nuc-sequence-aligned';
    } else {
        endpoint = 'aa-sequence-aligned/' + sequenceType.name;
    }

    const response = await fetch(`${config.lapisHost}/${endpoint}?${config.schema.primaryKey}=${accession}`);
    const fastaText = await response.text();
    const fastaEntries = parseFasta(fastaText);
    if (fastaEntries.length === 0) {
        return null;
    }
    return fastaEntries[0].sequence;
}
