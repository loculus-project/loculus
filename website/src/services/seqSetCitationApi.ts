import z from 'zod';

import type { ApiDefinition } from './apiClient.ts';
import { authorProfile, seqSets, seqSetRecords, seqSetCitations, sequenceCitations } from '../types/seqSetCitation.ts';

const seqSetIdAndVersion = z.object({
    seqSetId: z.string(),
    seqSetVersion: z.number(),
});

export const seqSetCitationApi = {
    getSeqSetsOfUser: {
        method: 'get',
        path: '/get-seqsets-of-user',
        response: seqSets,
    },
    getSeqSetCitations: {
        method: 'get',
        path: '/get-seqset-citations?seqSetId=:seqSetId&version=:version',
        response: seqSetCitations,
    },
    getSequenceCitations: {
        method: 'get',
        path: '/get-sequence-citations?accession=:accession',
        queries: z.object({
            version: z.number().optional(),
        }),
        response: sequenceCitations,
    },
    getSeqSet: {
        method: 'get',
        path: '/get-seqset?seqSetId=:seqSetId&version=:version',
        response: seqSets,
    },
    getSeqSetVersions: {
        method: 'get',
        path: '/get-seqset?seqSetId=:seqSetId',
        response: seqSets,
    },
    getSeqSetRecords: {
        method: 'get',
        path: '/get-seqset-records?seqSetId=:seqSetId&version=:version',
        response: seqSetRecords,
    },
    validateSeqSetRecords: {
        method: 'post',
        path: '/validate-seqset-records',
        body: z
            .array(
                z.object({
                    accession: z.string().optional(),
                    type: z.string().optional(),
                    isFocal: z.boolean(),
                }),
            )
            .optional(),
        response: z.object({
            valid: z.boolean(),
        }),
    },
    createSeqSet: {
        method: 'post',
        path: '/create-seqset',
        body: z.object({
            name: z.string(),
            description: z.string().optional(),
            records: z.array(
                z.object({
                    accession: z.string(),
                    type: z.string(),
                    isFocal: z.boolean(),
                }),
            ),
        }),
        response: seqSetIdAndVersion,
    },
    createSeqSetDOI: {
        method: 'post',
        path: '/create-seqset-doi?seqSetId=:seqSetId&version=:seqSetVersion',
        response: seqSetIdAndVersion,
    },
    updateSeqSet: {
        method: 'put',
        path: '/update-seqset',
        body: z.object({
            seqSetId: z.string(),
            name: z.string(),
            description: z.string().optional(),
            records: z
                .array(
                    z.object({
                        accession: z.string(),
                        type: z.string(),
                        isFocal: z.boolean(),
                    }),
                )
                .optional(),
        }),
        response: seqSetIdAndVersion,
    },
    deleteSeqSet: {
        method: 'delete',
        path: '/delete-seqset?seqSetId=:seqSetId&version=:seqSetVersion',
        response: z.never(),
    },
    getAuthor: {
        method: 'get',
        path: '/get-author?username=:username',
        response: authorProfile,
    },
} as const satisfies ApiDefinition;
