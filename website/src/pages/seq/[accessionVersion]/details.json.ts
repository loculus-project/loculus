import { type APIRoute } from 'astro';

import { findOrganismAndData } from './findOrganismAndData';
import { SequenceDetailsTableResultType } from './getSequenceDetailsTableData';
import { getRuntimeConfig, getSchema, seqSetsAreEnabled } from '../../../config';
import { getInstanceLogger } from '../../../logger.ts';
import { SeqSetCitationClient } from '../../../services/seqSetCitationClient.ts';
import type { DetailsJson } from '../../../types/detailsJson';
import { parseAccessionVersionFromString } from '../../../utils/extractAccessionVersion.ts';
import { getForwardedAccessToken } from '../../../utils/getAccessToken.ts';

const logger = getInstanceLogger('details.json');

export const GET: APIRoute = async ({ params, request, locals }) => {
    const { accessionVersion } = params as { accessionVersion: string };
    const { accession } = parseAccessionVersionFromString(accessionVersion);

    const accessToken = getForwardedAccessToken(request, locals.session);

    const sequenceCitationsPromise = seqSetsAreEnabled()
        ? SeqSetCitationClient.create().getSequenceCitations(accessToken, accession)
        : undefined;

    const sequenceDetailsTableData = await findOrganismAndData(accessionVersion, accessToken);

    if (sequenceDetailsTableData.isErr()) {
        logger.warn(
            `Could not find sequence details for accessionVersion ${accessionVersion}: ${sequenceDetailsTableData.error.message}`,
        );
        return new Response(`Error detected`, {
            status: sequenceDetailsTableData.error.isUnauthorized ? 401 : 404,
        });
    }

    const { organism, result } = sequenceDetailsTableData.value;

    if (result.type !== SequenceDetailsTableResultType.TABLE_DATA) {
        return new Response(`Error detected - could not find table data`, {
            status: 404,
        });
    }

    const sequenceCitations = (await sequenceCitationsPromise)?.unwrapOr(undefined);

    const clientConfig = getRuntimeConfig().public;

    const schema = getSchema(organism);

    const detailsDataUIProps: DetailsJson = {
        tableData: result.tableData,
        organism,
        accessionVersion,
        dataUseTermsHistory: result.dataUseTermsHistory,
        schema,
        clientConfig,
        segmentReferences: result.segmentReferences,
        isRevocation: result.isRevocation,
        sequenceEntryHistory: result.sequenceEntryHistory,
        sequenceCitations,
    };

    return new Response(JSON.stringify(detailsDataUIProps), {
        headers: {
            'Content-Type': 'application/json', // eslint-disable-line @typescript-eslint/naming-convention
            'Access-Control-Allow-Origin': '*', // eslint-disable-line @typescript-eslint/naming-convention
        },
    });
};
