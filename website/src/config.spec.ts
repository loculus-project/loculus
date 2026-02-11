import { describe, expect, it } from 'vitest';

import { validateWebsiteConfig } from './config.ts';
import type { WebsiteConfig } from './types/config.ts';
import { SINGLE_SEG_MULTI_REF_REFERENCEGENOMES_SCHEMA } from './types/referenceGenomes.spec.ts';

const defaultConfig: WebsiteConfig = {
    accessionPrefix: '',
    enableDataUseTerms: false,
    enableLoginNavigationItem: false,
    enableSeqSets: false,
    enableSubmissionNavigationItem: false,
    enableSubmissionPages: false,
    logo: { url: '', width: 0, height: 0 },
    name: '',
    organisms: {},
    metadataItemForCumulativeGroupGraph: null,
};

describe('validateWebsiteConfig', () => {
    it('should fail when "referenceIdentifierField" is not defined for an organism with multiple references', () => {
        const errors = validateWebsiteConfig({
            ...defaultConfig,
            organisms: {
                dummyOrganism: {
                    schema: {
                        organismName: 'dummy',
                        inputFields: [],
                        tableColumns: [],
                        primaryKey: '',
                        metadata: [],
                        defaultOrderBy: '',
                        defaultOrder: 'ascending',
                        submissionDataTypes: { consensusSequences: false },
                    },
                    referenceGenomes: SINGLE_SEG_MULTI_REF_REFERENCEGENOMES_SCHEMA,
                },
            },
        });

        expect(errors).toHaveLength(1);
        expect(errors[0].message).contains(
            `Organism 'dummyOrganism' has multiple references but referenceIdentifierField is not defined in the schema.`,
        );
    });
});
