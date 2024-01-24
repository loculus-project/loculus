import { Result } from 'neverthrow';

import { getTableData, type TableDataEntry } from '../../../../components/SequenceDetailsPage/getTableData.ts';
import { getSchema } from '../../../../config.ts';
import { routes } from '../../../../routes.ts';
import { LapisClient } from '../../../../services/lapisClient.ts';
import type { ProblemDetail } from '../../../../types/backend.ts';
import type { SequenceEntryHistory } from '../../../../types/lapis.ts';
import { parseAccessionVersionFromString } from '../../../../utils/extractAccessionVersion.ts';

export enum SequenceDetailsTableResultType {
    TABLE_DATA = 'tableData',
    REDIRECT = 'redirect',
}

type TableData = {
    type: SequenceDetailsTableResultType.TABLE_DATA;
    tableData: TableDataEntry[];
    sequenceEntryHistory: SequenceEntryHistory;
};

type Redirect = {
    type: SequenceDetailsTableResultType.REDIRECT;
    redirectUrl: string;
};

export const getSequenceDetailsTableData = async (
    accessionVersion: string,
    organism: string,
): Promise<Result<TableData | Redirect, ProblemDetail>> => {
    const { accession, version } = parseAccessionVersionFromString(accessionVersion);

    const lapisClient = LapisClient.createForOrganism(organism);

    if (version === undefined) {
        const latestVersionResult = await lapisClient.getLatestAccessionVersion(accession);
        return latestVersionResult.map((latestVersion) => ({
            type: SequenceDetailsTableResultType.REDIRECT,
            redirectUrl: routes.sequencesDetailsPage(organism, latestVersion),
        }));
    }

    const schema = getSchema(organism);

    const [tableDataResult, sequenceEntryHistoryResult] = await Promise.all([
        getTableData(accessionVersion, schema, lapisClient),
        lapisClient.getAllSequenceEntryHistoryForAccession(accession),
    ]);

    return Result.combine([tableDataResult, sequenceEntryHistoryResult]).map(([tableData, sequenceEntryHistory]) => ({
        type: SequenceDetailsTableResultType.TABLE_DATA as const,
        tableData,
        sequenceEntryHistory,
    }));
};
