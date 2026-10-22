import { z } from 'zod';

const SEQSET_DRAFT_KEY = 'loculus-draft-seqset';

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

export const getSeqSetDraft = (): SeqSetDraft | null => {
    try {
        const stored = sessionStorage.getItem(SEQSET_DRAFT_KEY);
        if (stored === null) return null;

        const result = seqSetDraft.safeParse(JSON.parse(stored));
        if (!result.success) {
            removeSeqSetDraft();
            return null;
        }
        return result.data;
    } catch {
        removeSeqSetDraft();
        return null;
    }
};

export const saveSeqSetDraft = (draft: SeqSetDraft) => {
    try {
        sessionStorage.setItem(SEQSET_DRAFT_KEY, JSON.stringify(draft));
    } catch {
        // sessionStorage can be unavailable, e.g. in some private browsing modes
    }
};

export const removeSeqSetDraft = () => {
    try {
        sessionStorage.removeItem(SEQSET_DRAFT_KEY);
    } catch {
        // sessionStorage can be unavailable, e.g. in some private browsing modes
    }
};

export const updateSeqSetDraft = (draft: SeqSetDraft, accessions: string[], isFocal: boolean): SeqSetDraft => {
    const added = new Set(accessions);
    return {
        ...draft,
        accessions: [
            ...draft.accessions.filter((record) => !added.has(record.accession)),
            ...accessions.map((accession) => ({ accession, isFocal })),
        ],
    };
};
