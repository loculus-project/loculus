import type { SeqSet } from '../../types/seqSetCitation';

export type CitationFormat = 'apa' | 'mla' | 'bibtex';

export const citationFormats: { id: CitationFormat; label: string }[] = [
    { id: 'apa', label: 'APA' },
    { id: 'mla', label: 'MLA' },
    { id: 'bibtex', label: 'BibTeX' },
];

type CitationInput = {
    seqSet: SeqSet;
    databaseName: string;
    /** Absolute URL of the SeqSet page, used when the SeqSet has no DOI yet. */
    seqSetUrl: string;
};

const formatYear = (date: string) => new Date(date).getFullYear();

const getCitationUrl = ({ seqSet, seqSetUrl }: CitationInput) =>
    seqSet.seqSetDOI === null || seqSet.seqSetDOI === undefined ? seqSetUrl : `https://doi.org/${seqSet.seqSetDOI}`;

const getBibtexCitation = (input: CitationInput) => {
    const { seqSet, databaseName } = input;
    const citationKey = (seqSet.seqSetDOI ?? `${seqSet.seqSetId}.${seqSet.seqSetVersion}`).replace(/[^\w]/g, '_');
    const fields = [
        `title = {SeqSet: ${seqSet.name}}`,
        `journal = {${databaseName}}`,
        `year = {${formatYear(seqSet.createdAt)}}`,
        `url = {${getCitationUrl(input)}}`,
    ];

    if (seqSet.seqSetDOI !== null && seqSet.seqSetDOI !== undefined) {
        fields.push(`doi = {${seqSet.seqSetDOI}}`);
    }

    return `@dataset{${citationKey},\n\t${fields.join(',\n\t')}\n}`;
};

const getMlaCitation = (input: CitationInput) => {
    const { seqSet, databaseName } = input;
    return `SeqSet: ${seqSet.name}. ${databaseName}, ${formatYear(seqSet.createdAt)}. ${getCitationUrl(input)}`;
};

const getApaCitation = (input: CitationInput) => {
    const { seqSet, databaseName } = input;
    return `SeqSet: ${seqSet.name}. (${formatYear(seqSet.createdAt)}). ${databaseName}. ${getCitationUrl(input)}`;
};

export const getCitation = (format: CitationFormat, input: CitationInput): string => {
    switch (format) {
        case 'bibtex':
            return getBibtexCitation(input);
        case 'mla':
            return getMlaCitation(input);
        case 'apa':
            return getApaCitation(input);
    }
};
