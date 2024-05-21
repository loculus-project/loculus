import { type APIRoute } from 'astro';

import { findOrganismAndData } from './findOrganismAndData';
import { SequenceDetailsTableResultType } from './getSequenceDetailsTableData';
import { getSchema, getRuntimeConfig } from '../../../config';

export const GET: APIRoute = async (req) => {
    const params = req.params as { accessionVersion: string; accessToken?: string };
    const { accessionVersion } = params;
    const sequenceDetailsTableData: any = await findOrganismAndData(accessionVersion);

    if (sequenceDetailsTableData.isOk() !== true) {
        return new Response(`Error detected`, {
            status: 404,
        });
    }

    const { organism, result } = sequenceDetailsTableData.value;

    if (result.type !== SequenceDetailsTableResultType.TABLE_DATA) {
        return new Response(`Error detected - could not find table data`, {
            status: 404,
        });
    }

    const clientConfig = getRuntimeConfig().public;

    const schema = getSchema(organism);
    const runtimeConfig = getRuntimeConfig();

    const detailsDataUIProps = {
        tableData: result.tableData,
        organism,
        accessionVersion,
        dataUseTermsHistory: result.dataUseTermsHistory,
        schema,
        runtimeConfig,
        clientConfig,
        sequenceEntryHistory:
            result.type === SequenceDetailsTableResultType.TABLE_DATA ? result.sequenceEntryHistory : undefined,
    };

    return new Response(JSON.stringify(detailsDataUIProps), {
        headers: {
            'Content-Type': 'application/json',
        },
    });
};
