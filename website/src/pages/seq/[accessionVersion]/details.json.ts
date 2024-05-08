import { type APIRoute } from 'astro';

import { findOrganismAndData } from './findOrganismAndData';
import { SequenceDetailsTableResultType } from './getSequenceDetailsTableData';
import { getSchema, getRuntimeConfig } from '../../../config';
import { type Group } from '../../../types/backend';
import { getMyGroups } from '../../../utils/getMyGroups';

export const GET: APIRoute = async (req) => {
    const params = req.params as { accessionVersion: string; accessToken?: string };
    const { accessionVersion, accessToken } = params;
    const sequenceDetailsTableData: any = await findOrganismAndData(accessionVersion);

    if (sequenceDetailsTableData.isOk() !== true) {
        return new Response(
            `
            <h1>404 Not Found</h1>`,
            {
                status: 404,
            },
        );
    }

    const { organism, result } = sequenceDetailsTableData.value;

    if (result.type !== SequenceDetailsTableResultType.TABLE_DATA) {
        return new Response(
            `
           Did not get table data ${JSON.stringify(result)}
        
        `,
            {
                status: 404,
            },
        );
    }

    const clientConfig = getRuntimeConfig().public;
    let myGroups: Group[] = [];

    if (accessToken !== undefined) {
        myGroups = await getMyGroups(accessToken);
    }

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
        myGroups,
    };

    return new Response(JSON.stringify(detailsDataUIProps), {
        headers: {
            'Content-Type': 'application/json',
        },
    });
};
