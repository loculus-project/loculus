import { type Result, err, ok } from 'neverthrow';

import { LapisClient } from '../../../services/lapisClient.ts';

const MAX_SEQUENCES = 5000;

interface SequenceEntry {
    [key: string]: string | null;
    seq: string;
    accessionVersion: string;
}

interface RequestParams {
    params: {
        organism: string;
    };
    request: Request;
}

interface MetadataEntry {
    [key: string]: string | undefined;
    accessionVersion: string;
}

interface QueryParameters {
    [key: string]: any;
    segment: string;
    headerFields: string[];
    downloadFileBasename: string;
}

const createErrorResponse = (status: number, error: string, details?: any) =>
    new Response(JSON.stringify({ error, ...details }), {
        status,
        headers: { 'Content-Type': 'application/json' },
    });

const parseQueryParams = (url: URL): QueryParameters => {
    const searchParams = new URLSearchParams(url.searchParams);
    const params: QueryParameters = {
        segment: searchParams.get('segment') ?? 'main',
        headerFields: searchParams.get('headerFields')?.split(',') ?? ['accessionVersion'],
        downloadFileBasename: searchParams.get('downloadFileBasename') ?? 'sequences',
    };

    searchParams.delete('segment');
    searchParams.delete('headerFields');
    return {
        ...params,
        queryFilters: Object.fromEntries(searchParams),
    };
};

const validateSequenceCount = async (client: LapisClient, queryParams: any): Promise<Result<number, string>> => {
    const countResult = await client.getCounts(queryParams);

    if (countResult.isErr()) {
        return err('Failed to check sequence count: ' + JSON.stringify(countResult.error));
    }

    const totalSequences = countResult.value.data[0].count;
    if (totalSequences > MAX_SEQUENCES) {
        return err(
            `This query would return ${totalSequences} sequences. Please limit your query to return no more than ${MAX_SEQUENCES} sequences.`,
        );
    }

    return ok(totalSequences);
};

const fetchSequenceData = async (
    client: LapisClient,
    queryParams: any,
    segmentName: string = 'main',
): Promise<Result<[any[], MetadataEntry[]], string>> => {
    const [sequencesResult, metadataResult] = await Promise.all([
        segmentName !== 'main'
            ? client.getUnalignedSequencesMultiSegmentJson(queryParams, segmentName)
            : client.getUnalignedSequencesJson(queryParams),
        client.getMetadataJson(queryParams),
    ]);

    if (sequencesResult.isErr()) {
        return err(`Failed to fetch sequences: ${sequencesResult.error}`);
    }
    if (metadataResult.isErr()) {
        return err(`Failed to fetch metadata: ${metadataResult.error}`);
    }

    return ok([sequencesResult.value as any[], metadataResult.value.data as MetadataEntry[]]);
};

const processSequenceData = (
    sequences: any[],
    metadata: MetadataEntry[],
    segmentName: string,
    headerFields: string[],
): Record<string, SequenceEntry> => {
    return sequences.reduce<Record<string, SequenceEntry>>((acc, sequence) => {
        const accessionVersion = sequence.accessionVersion;
        const metadataEntry = metadata.find((meta) => meta.accessionVersion === accessionVersion);

        const entry: SequenceEntry = {
            seq: sequence[segmentName],
            accessionVersion,
            ...headerFields.reduce(
                (fields, field) => ({
                    ...fields,
                    [field]: field !== 'seq' ? (metadataEntry?.[field] ?? null) : null,
                }),
                {},
            ),
        };

        acc[accessionVersion] = entry;
        return acc;
    }, {});
};

const generateFasta = (entries: Record<string, SequenceEntry>, headerFields: string[]): string => {
    return Object.values(entries)
        .map((entry) => {
            const header = headerFields
                .map((field) => entry[field])
                .filter(Boolean)
                .join('/');
            return `>${header}\n${entry.seq}`;
        })
        .join('\n');
};

// eslint-disable-next-line @typescript-eslint/naming-convention
export async function GET({ params, request }: RequestParams): Promise<Response> {
    const client = LapisClient.createForOrganism(params.organism);
    const { segment, headerFields, queryFilters, downloadFileBasename } = parseQueryParams(new URL(request.url));

    const countValidation = await validateSequenceCount(client, queryFilters);
    if (countValidation.isErr()) {
        return createErrorResponse(400, countValidation.error);
    }

    const dataResult = await fetchSequenceData(client, queryFilters, segment);
    if (dataResult.isErr()) {
        return createErrorResponse(500, dataResult.error);
    }

    const [sequences, metadata] = dataResult.value;

    const processedData = processSequenceData(sequences, metadata, segment, headerFields);
    const fastaContent = generateFasta(processedData, headerFields);

    return new Response(fastaContent, {
        status: 200,
        headers: {
            'Content-Type': 'application/x-fasta',
            'Content-Disposition': `attachment; filename="${downloadFileBasename}.fasta"`,
        },
    });
}
