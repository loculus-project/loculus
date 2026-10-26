import { SearchPage } from '../pages/search.page';

const ACCESSION_PATTERN = /(LOC_[A-Z0-9]+)/;

export async function collectAccessibleAccessions(searchPage: SearchPage): Promise<string[]> {
    const rows = searchPage.getSequenceRows();
    await rows.first().waitFor();

    const rowCount = await rows.count();
    const accessions = new Set<string>();

    for (let index = 0; index < rowCount && accessions.size < 3; index += 1) {
        const rowText = await rows.nth(index).innerText();
        const match = rowText.match(ACCESSION_PATTERN);
        if (match !== null) {
            accessions.add(match[1]);
        }
    }

    if (accessions.size === 0) {
        throw new Error('Unable to find any LOC accession IDs from search results');
    }

    const [first, second] = Array.from(accessions);

    if (second === undefined) {
        return [first, first];
    }

    return [first, second];
}
