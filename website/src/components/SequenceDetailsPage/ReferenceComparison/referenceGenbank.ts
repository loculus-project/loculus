type Reference = { name: string; sequence: string; insdcAccessionFull?: string };
type ReferenceGenbank = { genbankString: string; annotationNotice?: string };

export function unannotatedGenbank(reference: Reference): string {
    const name = reference.name.replace(/\s/g, '_');
    const sequence = reference.sequence.replace(/\s/g, '').toLowerCase();
    const lines =
        sequence.match(/.{1,60}/g)?.map((line, index) => `${String(index * 60 + 1).padStart(9)} ${line}`) ?? [];
    return `LOCUS       ${name} ${sequence.length} bp DNA\nDEFINITION  ${reference.name.replace(/[\r\n]/g, ' ')}\nFEATURES             Location/Qualifiers\nORIGIN\n${lines.join('\n')}\n//\n`;
}

export function referenceMatchesGenbank(reference: string, genbank: string): boolean {
    const origin = /^ORIGIN[^\n]*\n([\s\S]*?)^\/\//m.exec(genbank)?.[1];
    return origin?.replace(/[\s0-9]/g, '').toUpperCase() === reference.replace(/\s/g, '').toUpperCase();
}

const cache = new Map<string, { expires: number; result: Promise<string | undefined> }>();
async function fetchGenbank(accession: string): Promise<string | undefined> {
    const previous = cache.get(accession);
    if (previous !== undefined && previous.expires > Date.now()) return previous.result;
    const url = new URL('https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi');
    url.search = new URLSearchParams({
        db: 'nuccore',
        id: accession,
        rettype: 'gbwithparts',
        retmode: 'text',
    }).toString();
    const result = fetch(url, { signal: AbortSignal.timeout(10000) })
        .then(async (response) => (response.ok ? response.text() : undefined))
        .catch(() => undefined);
    if (cache.size >= 128) cache.delete(cache.keys().next().value!);
    cache.set(accession, { expires: Date.now() + 5 * 60 * 1000, result });
    return result;
}

export async function getReferenceGenbank(reference: Reference, load = fetchGenbank): Promise<ReferenceGenbank> {
    if (reference.insdcAccessionFull !== undefined) {
        const genbankString = await load(reference.insdcAccessionFull);
        if (genbankString !== undefined && referenceMatchesGenbank(reference.sequence, genbankString))
            return { genbankString };
    }
    return {
        genbankString: unannotatedGenbank(reference),
        annotationNotice: 'Reference annotations are unavailable. Showing nucleotide changes only.',
    };
}
