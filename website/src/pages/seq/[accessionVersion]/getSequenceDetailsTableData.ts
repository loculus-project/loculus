import { Result } from 'neverthrow';

import { getTableData } from '../../../components/SequenceDetailsPage/getTableData';
import { type TableDataEntry } from '../../../components/SequenceDetailsPage/types.ts';
import { getSchema } from '../../../config.ts';
import { routes } from '../../../routes/routes.ts';
import { BackendClient } from '../../../services/backendClient.ts';
import { LapisClient } from '../../../services/lapisClient.ts';
import type { DataUseTermsHistoryEntry, ProblemDetail } from '../../../types/backend.ts';
import type { SequenceEntryHistory } from '../../../types/lapis.ts';
import { parseAccessionVersionFromString } from '../../../utils/extractAccessionVersion.ts';

export enum SequenceDetailsTableResultType {
    TABLE_DATA = 'tableData',
    REDIRECT = 'redirect',
    ERROR = 'error',
}

export type TableData = {
    type: SequenceDetailsTableResultType.TABLE_DATA;
    tableData: TableDataEntry[];
    sequenceEntryHistory: SequenceEntryHistory;
    dataUseTermsHistory: DataUseTermsHistoryEntry[];
    isRevocation: boolean;
};

export type Redirect = {
    type: SequenceDetailsTableResultType.REDIRECT;
    redirectUrl: string;
};

export type SequenceDetailsTableDataResult = Promise<Result<TableData | Redirect, ProblemDetail>>;

export const getSequenceDetailsTableData = async (
    accessionVersion: string,
    organism: string,
): SequenceDetailsTableDataResult => {
    const { accession, version } = parseAccessionVersionFromString(accessionVersion);

    const lapisClient = LapisClient.createForOrganism(organism);
    const backendClient = BackendClient.create();

    if (version === undefined) {
        const latestVersionResult = await lapisClient.getLatestAccessionVersion(accession);
        return latestVersionResult.map((latestVersion) => ({
            type: SequenceDetailsTableResultType.REDIRECT,
            redirectUrl: routes.sequenceEntryDetailsPage(latestVersion),
        }));
    }

    const schema = getSchema(organism);

    const [tableDataResult, sequenceEntryHistoryResult, dataUseHistoryResult] = await Promise.all([
        getTableData(accessionVersion, schema, lapisClient),
        lapisClient.getAllSequenceEntryHistoryForAccession(accession),
        backendClient.call('getDataUseTermsHistory', {
            params: { accession },
        }),
    ]);

    return Result.combine([tableDataResult, sequenceEntryHistoryResult, dataUseHistoryResult]).map(
        ([tableData, sequenceEntryHistory, dataUseTermsHistory]) => ({
            type: SequenceDetailsTableResultType.TABLE_DATA as const,
            tableData: tableData.data,
            sequenceEntryHistory,
            dataUseTermsHistory,
            isRevocation: tableData.isRevocation,
        }),
    );
};
