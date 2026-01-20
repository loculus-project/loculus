import { describe, expect, it } from 'vitest';

import { validateWebsiteConfig } from './config.ts';
import type { WebsiteConfig } from './types/config.ts';
import { SINGLE_SEG_SINGLE_REF_REFERENCEGENOMES } from './types/referenceGenomes.spec.ts';

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
};

describe('validateWebsiteConfig', () => {
    it('should fail when "onlyForReference" is not a valid organism', () => {
        const errors = validateWebsiteConfig({
            ...defaultConfig,
            organisms: {
                dummyOrganism: {
                    schema: {
                        organismName: 'dummy',
                        metadata: [
                            {
                                type: 'string',
                                name: 'test field',
                                onlyForReference: 'nonExistentReferenceName',
                            },
                        ],
                        inputFields: [],
                        tableColumns: [],
                        primaryKey: '',
                        defaultOrderBy: '',
                        defaultOrder: 'ascending',
                        submissionDataTypes: { consensusSequences: false },
                    },
                    referenceGenomes: {},
                },
            },
        });

        expect(errors).toHaveLength(1);
        expect(errors[0].message).contains(
            `Metadata field 'test field' in organism 'dummyOrganism' references unknown suborganism 'nonExistentReferenceName' in 'onlyForReference'.`,
        );
    });

    it('should fail when "referenceIdentifierField" is not in metadata', () => {
        const errors = validateWebsiteConfig({
            ...defaultConfig,
            organisms: {
                dummyOrganism: {
                    schema: {
                        organismName: 'dummy',
                        metadata: [],
                        inputFields: [],
                        tableColumns: [],
                        primaryKey: '',
                        defaultOrderBy: '',
                        defaultOrder: 'ascending',
                        submissionDataTypes: { consensusSequences: false },
                        referenceIdentifierField: 'suborganismField',
                    },
                    referenceGenomes: SINGLE_SEG_SINGLE_REF_REFERENCEGENOMES,
                },
            },
        });

        expect(errors).toHaveLength(1);
        expect(errors[0].message).contains(
            `referenceIdentifierField 'suborganismField' of organism 'dummyOrganism' is not defined in the metadata`,
        );
    });
});
