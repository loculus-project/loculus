import { describe, expect, it } from 'vitest';

import { validateWebsiteConfig } from './config.ts';
import type { WebsiteConfig } from './types/config.ts';

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
    it('should fail when "onlyForReferenceName" is not a valid organism', () => {
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
                                onlyForReferenceName: 'nonExistentReferenceName',
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
            `Metadata field 'test field' in organism 'dummyOrganism' references unknown suborganism 'nonExistentReferenceName' in 'onlyForReferenceName'.`,
        );
    });

    it('should fail when "suborganismIdentifierField" is not in metadata', () => {
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
                        suborganismIdentifierField: 'suborganismField',
                    },
                    referenceGenomes: {},
                },
            },
        });

        expect(errors).toHaveLength(1);
        expect(errors[0].message).contains(
            `suborganismIdentifierField 'suborganismField' of organism 'dummyOrganism' is not defined in the metadata`,
        );
    });
});
