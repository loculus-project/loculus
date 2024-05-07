// Import necessary functions, types, and components
import { type APIRoute } from 'astro';

import { findOrganismAndData, type FindOrganismAndDataResult } from './findOrganismAndData';
import { SequenceDetailsTableResultType } from './getSequenceDetailsTableData';
import { getReferenceGenomes, getSchema, getRuntimeConfig } from '../../../config';
import { type Group } from '../../../types/backend';
import { getMyGroups } from '../../../utils/getMyGroups';


// Define type for request params and session
type RequestParams = {
    params: {
        accessionVersion: string;
        accessToken?: string;
    };
};

export const GET: APIRoute = async ({ params }: RequestParams) => {
    const { accessionVersion, accessToken } = params;
    const sequenceDetailsTableData: FindOrganismAndDataResult =  await findOrganismAndData(accessionVersion);

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

    const referenceGenomes = getReferenceGenomes(organism);
    const schema = getSchema(organism);
    const runtimeConfig = getRuntimeConfig();

    const detailsDataUIProps: DetailsDataUIResponse = {
        tableData: result.tableData,
        organism,
        referenceGenomes,
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
