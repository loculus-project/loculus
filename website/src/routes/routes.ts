import { SubmissionRouteUtils } from './SubmissionRoute.ts';
import type { UploadAction } from '../components/Submission/DataUploadForm.tsx';
import type { InputMode } from '../components/Submission/FormOrUploadWrapper.tsx';
import type { TemplateFileType } from '../pages/[organism]/submission/template/index.ts';
import { type AccessionVersion } from '../types/backend.ts';
import { FileType } from '../types/lapis.ts';
import { getAccessionVersionString } from '../utils/extractAccessionVersion.ts';

export type ContinueSubmissionIntent = {
    organism: string;
};

export const approxMaxAcceptableUrlLength = 1900;

export const routes = {
    apiDocumentationPage: () => '/api-documentation',
    organismStartPage: (organism: string) => `/${organism}`,
    searchPage: (organism: string) => withOrganism(organism, `/search`),
    metadataTemplate: (organism: string, format: UploadAction, fileType: TemplateFileType) =>
        withOrganism(organism, `/submission/template?format=${format}&fileType=${fileType}`),
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
    createGroup: (intent?: ContinueSubmissionIntent) =>
        withSearchParams('/user/createGroup', {
            continueSubmissionOrganism: intent?.organism,
        }),
    submissionPageWithoutGroup: (organism: string) => withOrganism(organism, '/submission'),
    submissionPage: (organism: string, groupId: number) =>
        SubmissionRouteUtils.toUrl({ name: 'portal', organism, groupId }),
    submitPage: (organism: string, groupId: number, inputMode: InputMode = 'bulk') =>
        SubmissionRouteUtils.toUrl({ name: 'submit', organism, groupId, inputMode }),
    revisePage: (organism: string, groupId: number) =>
        SubmissionRouteUtils.toUrl({ name: 'revise', organism, groupId }),
    editPage: (organism: string, accessionVersion: AccessionVersion) =>
        withOrganism(organism, `/submission/edit/${accessionVersion.accession}/${accessionVersion.version}`),
    userOverviewPage: (_organism?: string) => {
        return '/user';
    },
    groupOverviewPage: (groupId: number, intent?: ContinueSubmissionIntent) =>
        withSearchParams(`/group/${groupId}`, {
            continueSubmissionOrganism: intent?.organism,
        }),
    editGroupPage: (groupId: number) => `/group/${groupId}/edit`,
    userSequenceReviewPage: (organism: string, groupId: number) =>
        SubmissionRouteUtils.toUrl({ name: 'review', organism, groupId }),
    seqSetsPage: (username?: string) => {
        const seqSetPagePath = `/seqsets`;
        return username === undefined ? seqSetPagePath : seqSetPagePath + `?user=${username}`;
    },
    seqSetPage: (seqSetId: string, seqSetVersion: string) => {
        return `/seqsets/${seqSetId}.${seqSetVersion}`;
    },
    logout: () => '/logout',
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

function withSearchParams(path: string, params: Record<string, string | undefined> | undefined): string {
    if (params === undefined) {
        return path;
    }

    const searchParams = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
        if (value !== undefined) {
            searchParams.set(key, value);
        }
    }

    const query = searchParams.toString();
    return query.length > 0 ? `${path}?${query}` : path;
}
