import { describe, expect, test } from 'vitest';

import { toSameOriginFileUrl } from './toSameOriginFileUrl';

describe('toSameOriginFileUrl', () => {
    test('turns canonical website file links into same-origin paths', () => {
        expect(toSameOriginFileUrl('http://192.168.0.1:3000/seq/LOC_0001.1/annotations/LOC_0001.1.embl')).toBe(
            '/seq/LOC_0001.1/annotations/LOC_0001.1.embl',
        );
        expect(toSameOriginFileUrl('https://example.org/seq/LOC_0001.1/rawReads/reads%201.fastq.gz')).toBe(
            '/seq/LOC_0001.1/rawReads/reads%201.fastq.gz',
        );
    });

    test('leaves backend and S3 links unchanged', () => {
        const backendLink = 'https://backend.example.org/files/get/LOC_0001/1/rawReads/reads.fastq.gz';
        const s3Link = 'https://s3.example.org/bucket/files/abc?X-Amz-Signature=xyz';

        expect(toSameOriginFileUrl(backendLink)).toBe(backendLink);
        expect(toSameOriginFileUrl(s3Link)).toBe(s3Link);
    });

    test('leaves other website pages and relative URLs unchanged', () => {
        expect(toSameOriginFileUrl('https://example.org/seq/LOC_0001.1')).toBe('https://example.org/seq/LOC_0001.1');
        expect(toSameOriginFileUrl('/seq/LOC_0001.1/annotations/file.embl')).toBe(
            '/seq/LOC_0001.1/annotations/file.embl',
        );
    });
});
