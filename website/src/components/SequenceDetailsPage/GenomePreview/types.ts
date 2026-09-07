export type GenomePreviewData = {
    genbankString: string;
    alignedSequence: {
        name: string;
        sequence: string;
        insertions: { position: number; sequence: string }[];
    };
    annotationNotice?: string;
};
