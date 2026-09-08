export type ReferenceComparisonData = {
    genbankString: string;
    alignedSequence: {
        name: string;
        sequence: string;
        insertions: { position: number; sequence: string }[];
    };
    annotationNotice?: string;
};
