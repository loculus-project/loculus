import type { BaseType, Config, InsertionCount, MutationProportionCount, SequenceType } from './types';
import { parseFasta } from './utils/parseFasta';
import { isAlignedSequence, isUnalignedSequence } from './utils/sequenceTypeHelpers';

export async function fetchNumberSequences(config: Config): Promise<number> {
    const response = await fetch(`${config.lapisHost}/aggregated?country=Switzerland`);
    return (await response.json()).data[0].count;
}

export async function fetchSequenceList(config: Config): Promise<any[]> {
    const response = await fetch(`${config.lapisHost}/details?fields=${config.schema.primaryKey}&country=Switzerland`);
    return (await response.json()).data;
}

export async function fetchSequenceDetails(accession: string, config: Config): Promise<any> {
    const response = await fetch(`${config.lapisHost}/details?${config.schema.primaryKey}=${accession}`);
    return (await response.json()).data[0];
}

export async function fetchMutations(
    accession: string,
    type: BaseType,
    config: Config,
): Promise<MutationProportionCount[]> {
    const endpoint = type === 'nucleotide' ? 'nuc-mutations' : 'aa-mutations';
    const response = await fetch(`${config.lapisHost}/${endpoint}?${config.schema.primaryKey}=${accession}`);
    return (await response.json()).data;
}

export async function fetchInsertions(accession: string, type: BaseType, config: Config): Promise<InsertionCount[]> {
    const endpoint = type === 'nucleotide' ? 'nuc-insertions' : 'aa-insertions';
    const response = await fetch(`${config.lapisHost}/${endpoint}?${config.schema.primaryKey}=${accession}`);
    return (await response.json()).data;
}

export type Log = {
    level: string;
    message: string;
};
export const clientLogger = {
    log: async ({ message, level }: Log): Promise<Response> =>
        fetch('/admin/logs.txt', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ level, message }),
        }),
    error: async (message: string): Promise<Response> => clientLogger.log({ level: 'error', message }),
    info: async (message: string) => clientLogger.log({ level: 'info', message }),
};

export async function fetchSequence(
    accession: string,
    sequenceType: SequenceType,
    config: Config,
): Promise<string | undefined> {
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
        return undefined;
    }
    return fastaEntries[0].sequence;
}
