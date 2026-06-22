import { ok, Result } from 'neverthrow';

import { getTableData } from '../../../components/SequenceDetailsPage/getTableData';
import { type TableDataEntry } from '../../../components/SequenceDetailsPage/types.ts';
import { getReferenceGenomes, getSchema, seqSetsAreEnabled, type Organism } from '../../../config.ts';
import { routes } from '../../../routes/routes.ts';
import { createBackendClient } from '../../../services/backendClientFactory.ts';
import { LapisClient } from '../../../services/lapisClient.ts';
import { SeqSetCitationClient } from '../../../services/seqSetCitationClient.ts';
import type { DataUseTermsHistoryEntry, ProblemDetail } from '../../../types/backend.ts';
import type { SequenceEntryHistory } from '../../../types/lapis.ts';
import type { SequenceCitation } from '../../../types/seqSetCitation.ts';
import { parseAccessionVersionFromString } from '../../../utils/extractAccessionVersion.ts';
import type { SegmentReferenceSelections } from '../../../utils/sequenceTypeHelpers.ts';

export enum SequenceDetailsTableResultType {
    TABLE_DATA = 'tableData',
    REDIRECT = 'redirect',
}

type LapisSequenceDetails = {
    organism: string;
    tableData: TableDataEntry[];
    sequenceEntryHistory: SequenceEntryHistory;
    segmentReferences?: SegmentReferenceSelections;
    isRevocation: boolean;
};

type BackendSequenceDetails = {
    dataUseTermsHistory: DataUseTermsHistoryEntry[];
    sequenceCitations?: SequenceCitation[];
};

type TableData = {
    organism: string;
    type: SequenceDetailsTableResultType.TABLE_DATA;
    tableData: TableDataEntry[];
    sequenceEntryHistory: SequenceEntryHistory;
    segmentReferences?: SegmentReferenceSelections;
    isRevocation: boolean;
    dataUseTermsHistory: DataUseTermsHistoryEntry[];
    sequenceCitations?: SequenceCitation[];
};

export type Redirect = {
    organism: string;
    type: SequenceDetailsTableResultType.REDIRECT;
    redirectUrl: string;
};

type LapisSequenceDetailsResult = Result<LapisSequenceDetails, ProblemDetail>;
type BackendSequenceDetailsResult = Result<BackendSequenceDetails, ProblemDetail>;
type SequenceDetailsTableDataResult = Result<TableData | Redirect, ProblemDetail>;

const getLapisSequenceDetails = async (
    accessionVersion: string,
    organism: string,
): Promise<LapisSequenceDetailsResult> => {
    const { accession } = parseAccessionVersionFromString(accessionVersion);
    const lapisClient = LapisClient.createForOrganism(organism);
    const schema = getSchema(organism);
    const referenceGenomesInfo = getReferenceGenomes(organism);

    const [tableDataResult, sequenceEntryHistoryResult] = await Promise.all([
        getTableData(accessionVersion, schema, referenceGenomesInfo, lapisClient),
        lapisClient.getAllSequenceEntryHistoryForAccession(accession),
    ]);

    return Result.combine([tableDataResult, sequenceEntryHistoryResult]).map(([tableData, sequenceEntryHistory]) => ({
        organism,
        tableData: tableData.data,
        sequenceEntryHistory,
        segmentReferences: tableData.segmentReferences,
        isRevocation: tableData.isRevocation,
    }));
};

const getBackendSequenceDetails = async (accessionVersion: string): Promise<BackendSequenceDetailsResult> => {
    const { accession } = parseAccessionVersionFromString(accessionVersion);
    const backendClient = createBackendClient();
    const seqSetCitationClient = SeqSetCitationClient.create();

    const [dataUseHistoryResult, sequenceCitationsResult] = await Promise.all([
        backendClient.getDataUseTermsHistory(accession),
        // If enabled, fetch citations across all versions of the accession
        seqSetsAreEnabled()
            ? seqSetCitationClient.call('getSequenceCitations', {
                  params: { accession },
              })
            : ok(undefined),
    ]);

    return Result.combine([dataUseHistoryResult, sequenceCitationsResult]).map(
        ([dataUseTermsHistory, sequenceCitations]) => ({
            dataUseTermsHistory,
            sequenceCitations,
        }),
    );
};

export const getSequenceDetailsTableData = async (
    accessionVersion: string,
    organisms: Organism[],
): Promise<SequenceDetailsTableDataResult> => {
    const { accession, version } = parseAccessionVersionFromString(accessionVersion);

    if (version === undefined) {
        const latestVersions = organisms.map((organism) =>
            LapisClient.createForOrganism(organism.key)
                .getLatestAccessionVersion(accession)
                .then((result) =>
                    result.isOk()
                        ? ok({ organism: organism.key, result: result.value })
                        : Promise.reject(new Error(`${organism.key}: '${result.error.detail}'`)),
                ),
        );
        const latestVersionResult = await Promise.any(latestVersions);
        return latestVersionResult.map((latestVersion) => ({
            organism: latestVersion.organism,
            type: SequenceDetailsTableResultType.REDIRECT,
            redirectUrl: routes.sequenceEntryDetailsPage(latestVersion.result),
        }));
    }

    const backendPromise = getBackendSequenceDetails(accessionVersion);
    const lapisPromises = organisms.map((organism) =>
        getLapisSequenceDetails(accessionVersion, organism.key).then((result) =>
            result.isOk() ? result : Promise.reject(new Error(`${organism.key}: '${result.error.detail}'`)),
        ),
    );

    const [backendResult, lapisResult] = await Promise.all([backendPromise, Promise.any(lapisPromises)]);

    return Result.combine([backendResult, lapisResult]).map(([backendData, lapisData]) => ({
        organism: lapisData.organism,
        type: SequenceDetailsTableResultType.TABLE_DATA as const,
        tableData: lapisData.tableData,
        sequenceEntryHistory: lapisData.sequenceEntryHistory,
        dataUseTermsHistory: backendData.dataUseTermsHistory,
        sequenceCitations: backendData.sequenceCitations,
        segmentReferences: lapisData.segmentReferences,
        isRevocation: lapisData.isRevocation,
    }));
};
