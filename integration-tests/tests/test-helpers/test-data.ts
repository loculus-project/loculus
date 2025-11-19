/**
 * Common test sequences and metadata for use across integration tests.
 * This file centralizes test data to reduce duplication and improve maintainability.
 */

/**
 * Short Ebola Sudan test sequence for basic testing
 */
export const EBOLA_SUDAN_SHORT_SEQUENCE =
    'ATGGATAAACGGGTGAGAGGTTCATGGGCCCTGGGAGGACAATCTGAAGTTGATCTTGACTACCACAAAA' +
    'TATTAACAGCCGGGCTTTCGGTCCAACAAGGGATTGTGCGACAAAGAGTCATCCCGGTATATGTTGTGAG';

/**
 * Full-length Ebola Sudan test sequence for comprehensive testing
 */
export const EBOLA_SUDAN_FULL_SEQUENCE =
    'ATTGATCTCATCATTTACCAATTGGAGACCGTTTAACTAGTCAATCCCCCATTTGGGGGCATTCCTAAAGTGTTGCAA' +
    'AGGTATGTGGGTCGTATTGCTTTGCCTTTTCCTAACCTGGCTCCTCCTACAATTCTAACCTGCTTGATAAGTGTGATTACCTG' +
    'AGTAATAGACTAATTTCGTCCTGGTAATTAGCATTTTCTAGTAAAACCAATACTATCTCAAGTCCTAAGAGGAGGTGAGAAGA' +
    'GGGTCTCGAGGTATCCCTCCAGTCCACAAAATCTAGCTAATTTTAGCTGAGTGGACTGATTACTCTCATCACACGCTAACTAC' +
    'TAAGGGTTTACCTGAGAGCCTACAACATGGATAAACGGGTGAGAGGTTCATGGGCCCTGGGAGGACAATCTGAAGTTGATCTT' +
    'GACTACCACAAAATATTAACAGCCGGGCTTTCGGTCCAACAAGGGATTGTGCGACAAAGAGTCATCCCGGTATATGTTGTGAG' +
    'TGATCTTGAGGGTATTTGTCAACATATCATTCAGGCCTTTGAAGCAGGCGTAGATTTCCAAGATAATGCTGACAGCTTCCTTT' +
    'TACTTTTATGTTTACATCATGCTTACCAAGGAGATCATAGGCTCTTCCTCAAAAGTGATGCAGTTCAATACTTAGAGGGCCAT' +
    'GGTTTCAGGTTTGAGGTCCGAGAAAAGGAGAATGTGCACCGTCTGGATGAATTGTTGCCCAATGTCACCGGTGGAAAAAATCT' +
    'TAGGAGAACATTGGCTGCAATGCCTGAAGAGGAGACAACAGAAGCTAACGCTGGTCAGTTTTTATCCTTTGCCAGTTTGTTTC' +
    'TACCCAAACTTGTCGTTGGGGAGAAAGCGTGTCTGGAAAAAGTACAAAGGCAGATTCAGGTCCATGCAGAACAAGGGCTCATT' +
    'CAATATCCAACTTCCTGGCAATCAGTTGGACACATGATGGTGATCTTCCGTTTGATGAGAACAAACTTTTTAATCAAGTTCCT' +
    'ACTAATACATCAGGGGATGCACATGG';

/**
 * Helper function to create standard test metadata with optional overrides
 */
export function createTestMetadata(overrides?: {
    submissionId?: string;
    collectionCountry?: string;
    collectionDate?: string;
    authorAffiliations?: string;
}) {
    return {
        submissionId: overrides?.submissionId ?? `test-${Date.now()}`,
        collectionCountry: overrides?.collectionCountry ?? 'Switzerland',
        collectionDate: overrides?.collectionDate ?? '2021-01-15',
        authorAffiliations: overrides?.authorAffiliations ?? 'Test Institute',
    };
}

/**
 * Helper function to create standard sequence data
 */
export function createTestSequenceData(sequence: string = EBOLA_SUDAN_SHORT_SEQUENCE) {
    return {
        main: sequence,
    };
}

/**
 * Helper function to create revision metadata TSV with accession column
 * Used for bulk revision operations
 * @param accessions - Array of accessions to revise
 * @param baseSubmissionId - Base ID for submission IDs (will be appended with index)
 */
export function createRevisionMetadataTsv(accessions: string[], baseSubmissionId?: string): string {
    const baseId = baseSubmissionId || `revision-${Date.now()}`;
    const header =
        'accession\tsubmissionId\tcollectionCountry\tcollectionDate\tauthorAffiliations';
    const rows = accessions.map((accession, index) => {
        return `${accession}\t${baseId}-${index}\tFrance\t2021-02-15\tRevision Institute`;
    });
    return [header, ...rows].join('\n');
}

/**
 * Helper function to create FASTA content for multiple sequences
 */
export function createFastaContent(sequences: Array<{ id: string; sequence: string }>): string {
    return sequences.map((seq) => `>${seq.id}\n${seq.sequence}`).join('\n');
}