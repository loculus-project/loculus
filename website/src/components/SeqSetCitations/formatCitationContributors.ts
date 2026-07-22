import type { CitationContributor } from '../../types/seqSetCitation';

const MAX_DISPLAYED_CONTRIBUTORS = 10;

const formatContributor = ({ givenName, surname }: CitationContributor) =>
    [givenName, surname].filter((name) => name).join(' ');

export const formatCitationContributors = (contributors: CitationContributor[]) => {
    const formattedContributors = contributors.map(formatContributor).filter((name) => name);

    if (formattedContributors.length <= MAX_DISPLAYED_CONTRIBUTORS) {
        return formattedContributors.join(', ');
    }

    return `${formattedContributors.slice(0, MAX_DISPLAYED_CONTRIBUTORS).join(', ')}, ...`;
};
