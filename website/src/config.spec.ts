import fs from 'fs';
import os from 'os';
import path from 'path';

import { describe, expect, it } from 'vitest';

import { configuredOrganismsFromConfig, readWebsiteConfigFromDir, validateWebsiteConfig } from './config.ts';
import type { InstanceConfig, WebsiteConfig } from './types/config.ts';
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
    dateFieldForGroupGraph: null,
    readOnlyMode: false,
};

const defaultOrganismConfig = (organismName: string): InstanceConfig => ({
    schema: {
        organismName,
        inputFields: [],
        tableColumns: [],
        primaryKey: '',
        metadata: [],
        defaultOrderBy: '',
        defaultOrder: 'ascending',
        submissionDataTypes: { consensusSequences: false },
    },
});

describe('validateWebsiteConfig', () => {
    it('should fail when "referenceIdentifierField" is not defined for an organism with multiple references', () => {
        const errors = validateWebsiteConfig({
            ...defaultConfig,
            organisms: {
                dummyOrganism: {
                    ...defaultOrganismConfig('dummy'),
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

describe('readWebsiteConfigFromDir', () => {
    it('merges organism configs from the organisms directory', () => {
        const configDir = fs.mkdtempSync(path.join(os.tmpdir(), 'loculus-website-config-'));
        try {
            fs.writeFileSync(
                path.join(configDir, 'website_config.json'),
                JSON.stringify({
                    ...defaultConfig,
                    organisms: {
                        zika: defaultOrganismConfig('Zika Virus'),
                    },
                }),
            );
            fs.mkdirSync(path.join(configDir, 'organisms'));
            fs.writeFileSync(
                path.join(configDir, 'organisms', 'andes.json'),
                JSON.stringify(defaultOrganismConfig('Andes Virus [Hantavirus]')),
            );

            const config = readWebsiteConfigFromDir(configDir);

            expect(Object.keys(config.organisms).sort()).toEqual(['andes', 'zika']);
            expect(config.organisms.andes.schema.organismName).toBe('Andes Virus [Hantavirus]');
        } finally {
            fs.rmSync(configDir, { recursive: true, force: true });
        }
    });
});

describe('configuredOrganismsFromConfig', () => {
    it('sorts organisms by display name instead of key', () => {
        const organisms = configuredOrganismsFromConfig({
            ...defaultConfig,
            organisms: {
                zika: defaultOrganismConfig('Zika Virus'),
                andes: defaultOrganismConfig('Andes Virus [Hantavirus]'),
            },
        });

        expect(organisms.map((organism) => organism.key)).toEqual(['andes', 'zika']);
    });
});
