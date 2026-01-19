import { Result } from 'neverthrow';

import { getTableData } from '../../../components/SequenceDetailsPage/getTableData';
import { type TableDataEntry } from '../../../components/SequenceDetailsPage/types.ts';
import { getReferenceGenomes, getSchema } from '../../../config.ts';
import { routes } from '../../../routes/routes.ts';
import { createBackendClient } from '../../../services/backendClientFactory.ts';
import { LapisClient } from '../../../services/lapisClient.ts';
import type { DataUseTermsHistoryEntry, ProblemDetail } from '../../../types/backend.ts';
import type { SequenceEntryHistory } from '../../../types/lapis.ts';
import { parseAccessionVersionFromString } from '../../../utils/extractAccessionVersion.ts';
import type { SegmentReferenceSelections } from '../../../utils/sequenceTypeHelpers.ts';

export enum SequenceDetailsTableResultType {
    TABLE_DATA = 'tableData',
    REDIRECT = 'redirect',
}

export type TableData = {
    type: SequenceDetailsTableResultType.TABLE_DATA;
    tableData: TableDataEntry[];
    sequenceEntryHistory: SequenceEntryHistory;
    dataUseTermsHistory: DataUseTermsHistoryEntry[];
    segmentReferences: SegmentReferenceSelections;
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
    const backendClient = createBackendClient();

    if (version === undefined) {
        const latestVersionResult = await lapisClient.getLatestAccessionVersion(accession);
        return latestVersionResult.map((latestVersion) => ({
            type: SequenceDetailsTableResultType.REDIRECT,
            redirectUrl: routes.sequenceEntryDetailsPage(latestVersion),
        }));
    }

    const schema = getSchema(organism);
    const referenceGenomes = getReferenceGenomes(organism);

    const [tableDataResult, sequenceEntryHistoryResult, dataUseHistoryResult] = await Promise.all([
        getTableData(accessionVersion, schema, referenceGenomes, lapisClient),
        lapisClient.getAllSequenceEntryHistoryForAccession(accession),
        backendClient.getDataUseTermsHistory(accession),
    ]);

    return Result.combine([tableDataResult, sequenceEntryHistoryResult, dataUseHistoryResult]).map(
        ([tableData, sequenceEntryHistory, dataUseTermsHistory]) => ({
            type: SequenceDetailsTableResultType.TABLE_DATA as const,
            tableData: tableData.data,
            sequenceEntryHistory,
            dataUseTermsHistory,
            segmentReferences: tableData.segmentReferences,
            isRevocation: tableData.isRevocation,
        }),
    );
};
