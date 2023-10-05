import { err, ok, type Result } from 'neverthrow';
import type z from 'zod';

import type { BaseType, Config, InsertionCount, MutationProportionCount, SequenceType, ServiceUrls } from './types';
import { parseFasta } from './utils/parseFasta';
import { isAlignedSequence, isUnalignedSequence } from './utils/sequenceTypeHelpers';

export async function fetchSequenceDetails(
    accession: string,
    config: Config,
    serviceConfig: ServiceUrls,
): Promise<any> {
    const response = await fetch(`${serviceConfig.lapisUrl}/details?${config.schema.primaryKey}=${accession}`);
    return (await response.json()).data[0];
}

export async function fetchMutations(
    accession: string,
    type: BaseType,
    config: Config,
    serviceConfig: ServiceUrls,
): Promise<MutationProportionCount[]> {
    const endpoint = type === 'nucleotide' ? 'nucleotideMutations' : 'aminoAcidMutations';
    const response = await fetch(`${serviceConfig.lapisUrl}/${endpoint}?${config.schema.primaryKey}=${accession}`);
    return (await response.json()).data;
}

export async function fetchInsertions(
    accession: string,
    type: BaseType,
    config: Config,
    serviceConfig: ServiceUrls,
): Promise<InsertionCount[]> {
    const endpoint = type === 'nucleotide' ? 'nucleotideInsertions' : 'aminoAcidInsertions';
    const response = await fetch(`${serviceConfig.lapisUrl}/${endpoint}?${config.schema.primaryKey}=${accession}`);
    return (await response.json()).data;
}

export type Log = {
    level: string;
    message: string;
    instance?: string;
};

type ClientLogger = {
    log: (log: Log) => Promise<Response>;
    error: (message: string) => Promise<Response>;
    info: (message: string) => Promise<Response>;
};

export const getClientLogger = (instance: string = 'client'): ClientLogger => {
    const clientLogger = {
        log: async ({ message, level, instance }: Log): Promise<Response> =>
            fetch('/admin/logs.txt', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ level, message, instance }),
            }),
        error: async (message: string): Promise<Response> => clientLogger.log({ level: 'error', instance, message }),
        info: async (message: string) => clientLogger.log({ level: 'info', instance, message }),
    };
    return clientLogger;
};

export async function fetchSequence(
    accession: string,
    sequenceType: SequenceType,
    config: Config,
    serviceConfig: ServiceUrls,
): Promise<string | undefined> {
    let endpoint: string;
    if (isUnalignedSequence(sequenceType)) {
        // endpoint = 'nuc-sequence';
        return Promise.reject("LAPIS v2 doesn't support unaligned nucleotide sequences yet");
    } else if (isAlignedSequence(sequenceType)) {
        endpoint = 'alignedNucleotideSequences';
    } else {
        endpoint = 'aminoAcidSequences/' + sequenceType.name;
    }

    const response = await fetch(`${serviceConfig.lapisUrl}/${endpoint}?${config.schema.primaryKey}=${accession}`);
    const fastaText = await response.text();
    const fastaEntries = parseFasta(fastaText);
    if (fastaEntries.length === 0) {
        return undefined;
    }
    return fastaEntries[0].sequence;
}

type FetchParameter<ResponseType> = {
    endpoint: `/${string}`;
    backendUrl: string;
    zodSchema?: z.Schema<ResponseType>;
    options?: RequestInit;
};

export const clientFetch = async <ResponseType>({
    endpoint,
    backendUrl,
    zodSchema,
    options,
}: FetchParameter<ResponseType>): Promise<Result<ResponseType, string>> => {
    const logger = getClientLogger('clientFetch ' + endpoint);
    try {
        const response = await fetch(`${backendUrl}${endpoint}`, options);

        if (!response.ok) {
            await logger.error(`Failed to fetch user sequences with status ${response.status}`);
            return err(`Failed to fetch user sequences ${JSON.stringify(await response.text())}`);
        }

        try {
            if (zodSchema === undefined) {
                return ok(undefined as unknown as ResponseType);
            }

            const parser = (candidate: unknown) => {
                try {
                    return ok(zodSchema.parse(candidate));
                } catch (error) {
                    return err((error as Error).message);
                }
            };

            const responseJson = await response.json();

            return parser(responseJson);
        } catch (error) {
            await logger.error(
                `Parsing the response review for sequence version failed with error '${JSON.stringify(error)}'`,
            );
            return err(`Parsing the response review for sequence version failed with error '${JSON.stringify(error)}'`);
        }
    } catch (error) {
        await logger.error(`Failed to fetch user sequences with error '${JSON.stringify(error)}'`);
        return err(`Failed to fetch user sequences with error '${JSON.stringify(error)}'`);
    }
};
