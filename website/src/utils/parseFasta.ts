export type FastaEntry = {
    name: string;
    sequence: string;
};

export function parseFasta(fasta: string): FastaEntry[] {
    const fastaEntries: FastaEntry[] = [];
    let currentEntry: FastaEntry | null = null;

    const lines = fasta.split('\n');
    for (const line of lines) {
        if (line.startsWith('>')) {
            const name = line.slice(1).trim();
            currentEntry = { name, sequence: '' };
            fastaEntries.push(currentEntry);
        } else {
            const sequence = line.trim();
            if (currentEntry) {
                currentEntry.sequence += sequence;
            } else {
                throw new Error('Fasta parsing error: encountered a sequence line without a preceding name line');
            }
        }
    }

    return fastaEntries;
}
