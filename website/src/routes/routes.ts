import { SubmissionRouteUtils } from './SubmissionRoute.ts';
import type { UploadAction } from '../components/Submission/DataUploadForm.tsx';
import { type AccessionVersion } from '../types/backend.ts';
import { FileType } from '../types/lapis.ts';
import { getAccessionVersionString } from '../utils/extractAccessionVersion.ts';

export const approxMaxAcceptableUrlLength = 1900;
export const SEARCH = 'SEARCH';
export const MY_SEQUENCES = 'MY_SEQUENCES';

export const routes = {
    apiDocumentationPage: () => '/api-documentation',
    organismStartPage: (organism: string) => `/${organism}`,
    searchPage: (organism: string) => withOrganism(organism, `/search`),
    metadataTemplate: (organism: string, format: UploadAction) =>
        withOrganism(organism, `/submission/template?format=${format}`),
    metadataOverview: (organism: string) => withOrganism(organism, `/metadata-overview`),

    mySequencesPage: (organism: string, groupId: number) =>
        SubmissionRouteUtils.toUrl({
            name: 'released',
            organism,
            groupId,
            searchParams: new URLSearchParams({}),
        }),
    sequenceEntryDetailsPage: (accessionVersion: AccessionVersion | string) =>
        `/seq/${getAccessionVersionString(accessionVersion)}`,
    sequenceEntryVersionsPage: (accessionVersion: AccessionVersion | string) =>
        `/seq/${getAccessionVersionString(accessionVersion)}/versions`,
    sequenceEntryFastaPage: (accessionVersion: AccessionVersion | string, download = false) =>
        sequenceEntryDownloadUrl(accessionVersion, FileType.FASTA, download),
    sequenceEntryTsvPage: (accessionVersion: AccessionVersion | string, download = false) =>
        sequenceEntryDownloadUrl(accessionVersion, FileType.TSV, download),
    createGroup: () => '/user/createGroup',
    submissionPageWithoutGroup: (organism: string) => withOrganism(organism, '/submission'),
    submissionPage: (organism: string, groupId: number) =>
        SubmissionRouteUtils.toUrl({ name: 'portal', organism, groupId }),
    submitPage: (organism: string, groupId: number) =>
        SubmissionRouteUtils.toUrl({ name: 'submit', organism, groupId }),
    revisePage: (organism: string, groupId: number) =>
        SubmissionRouteUtils.toUrl({ name: 'revise', organism, groupId }),
    editPage: (organism: string, accessionVersion: AccessionVersion) =>
        withOrganism(organism, `/submission/edit/${accessionVersion.accession}/${accessionVersion.version}`),
    userOverviewPage: (organism?: string) => {
        const userPagePath = `/user`;
        return organism === undefined ? userPagePath : withOrganism(organism, userPagePath);
    },
    groupOverviewPage: (groupId: number) => `/group/${groupId}`,
    editGroupPage: (groupId: number) => `/group/${groupId}/edit`,
    userSequenceReviewPage: (organism: string, groupId: number) =>
        SubmissionRouteUtils.toUrl({ name: 'review', organism, groupId }),
    versionPage: (accession: string) => `/seq/${accession}/versions`,
    seqSetsPage: (username?: string) => {
        const seqSetPagePath = `/seqsets`;
        return username === undefined ? seqSetPagePath : seqSetPagePath + `?user=${username}`;
    },
    seqSetPage: (seqSetId: string, seqSetVersion: string) => {
        return `/seqsets/${seqSetId}.${seqSetVersion}`;
    },
    logout: () => '/logout',
    organismSelectorPage: (redirectTo: string) => `/organism-selector/${redirectTo}`,
    datauseTermsPage: () => '/about/terms-of-use/data-use-terms',
};

function withOrganism(organism: string, path: `/${string}`) {
    return `/${organism}${path}`;
}

function sequenceEntryDownloadUrl(accessionVersion: AccessionVersion | string, fileType: FileType, download = false) {
    let url = `${routes.sequenceEntryDetailsPage(accessionVersion)}.${fileType}`;
    if (download) {
        url += '?download';
    }
    return url;
}
