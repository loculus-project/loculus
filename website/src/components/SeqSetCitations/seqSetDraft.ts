import { z } from 'zod';

const SEQ_SET_DRAFT_KEY = 'loculus-draft-seqset';

export const MAX_SEQ_SET_DRAFT_ENTRIES = 10000;

const seqSetDraft = z.object({
    name: z.string(),
    description: z.string(),
    accessions: z.array(
        z.object({
            accession: z.string(),
            isFocal: z.boolean(),
        }),
    ),
});
export type SeqSetDraft = z.infer<typeof seqSetDraft>;

export const readSeqSetDraft = (): SeqSetDraft | null => {
    try {
        const stored = sessionStorage.getItem(SEQ_SET_DRAFT_KEY);
        if (stored === null) {
            return null;
        }
        const result = seqSetDraft.safeParse(JSON.parse(stored));
        if (!result.success) {
            clearSeqSetDraft();
            return null;
        }
        return result.data;
    } catch {
        clearSeqSetDraft();
        return null;
    }
};

export const writeSeqSetDraft = (draft: SeqSetDraft) => {
    try {
        sessionStorage.setItem(SEQ_SET_DRAFT_KEY, JSON.stringify(draft));
    } catch {
        // sessionStorage can be unavailable, e.g. in some private browsing modes
    }
};

export const clearSeqSetDraft = () => {
    try {
        sessionStorage.removeItem(SEQ_SET_DRAFT_KEY);
    } catch {
        // sessionStorage can be unavailable, e.g. in some private browsing modes
    }
};

export const addToSeqSetDraft = (draft: SeqSetDraft, accessions: string[], isFocal: boolean): SeqSetDraft => {
    const added = new Set(accessions);
    return {
        ...draft,
        accessions: [
            ...draft.accessions.filter((record) => !added.has(record.accession)),
            ...accessions.map((accession) => ({ accession, isFocal })),
        ],
    };
};
