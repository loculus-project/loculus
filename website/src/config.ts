import fs from 'fs';
import path from 'path';

import type { z, ZodError } from 'zod';

import { ACCESSION_FIELD, FASTA_IDS_FIELD, SUBMISSION_ID_INPUT_FIELD } from './settings.ts';
import {
    type InputField,
    type InstanceConfig,
    type Schema,
    type SequenceFlaggingConfig,
    type WebsiteConfig,
    websiteConfig,
} from './types/config.ts';
import { type ReferenceGenomesInfo } from './types/referencesGenomes.ts';
import { runtimeConfig, type RuntimeConfig, type ServiceUrls } from './types/runtimeConfig.ts';
import { toReferenceGenomes } from './utils/sequenceTypeHelpers.ts';

let _config: WebsiteConfig | null = null;
let _runtimeConfig: RuntimeConfig | null = null;

function getConfigDir(): string {
    const configDir = import.meta.env.CONFIG_DIR;
    if (typeof configDir !== 'string' || configDir === '') {
        throw new Error(`CONFIG_DIR environment variable was not set during build time, is '${configDir}'`);
    }
    return configDir;
}

export function validateWebsiteConfig(config: WebsiteConfig): Error[] {
    const errors: Error[] = [];
    Array.from(Object.entries(config.organisms).values()).forEach(([organism, schema]) => {
        if (schema.schema.metadataTemplate !== undefined) {
            schema.schema.metadataTemplate.forEach((fieldName) => {
                if (schema.schema.inputFields.find((inputField) => inputField.name === fieldName) === undefined) {
                    errors.push(
                        Error(
                            `Error in ${organism}.schema.metadataTemplate: ` +
                                `${fieldName} is not defined in the inputFields.`,
                        ),
                    );
                }
            });
        }

        const referenceIdentifierField = schema.schema.referenceIdentifierField;
        const hasMultipleReferences = schema.referenceGenomes
            ?.map((segment) => segment.references.length > 1)
            .some((v) => v);
        if (referenceIdentifierField == undefined && hasMultipleReferences) {
            errors.push(
                new Error(
                    `Organism '${organism}' has multiple references but referenceIdentifierField is not defined in the schema.`,
                ),
            );
        }
    });
    return errors;
}

export function getWebsiteConfig(): WebsiteConfig {
    if (_config === null) {
        const config = readTypedConfigFile('website_config.json', websiteConfig);
        const validationErrors = validateWebsiteConfig(config);
        if (validationErrors.length > 0) {
            throw new AggregateError(validationErrors, 'There were validation errors in the website_config.json');
        }
        _config = config;
    }
    return _config;
}

/**
 * If sequence flagging is configured, returns a report URL to create a GitHub issue for the given
 * organism and accession version.
 * Returns undefined if sequence flagging is not configured.
 */
export function getGitHubReportUrl(
    sequenceFlaggingConfig: SequenceFlaggingConfig | undefined,
    organism: string,
    accessionVersion: string,
): string | undefined {
    if (sequenceFlaggingConfig === undefined) return undefined;

    const ghConf = sequenceFlaggingConfig.github;
    const url = new URL(`/${ghConf.organization}/${ghConf.repository}/issues/new`, 'https://github.com');
    if (ghConf.issueTemplate) {
        url.searchParams.append('template', ghConf.issueTemplate);
    }
    url.searchParams.append('title', `[${organism} - ${accessionVersion}]`);
    return url.toString();
}

export function safeGetWebsiteConfig(): WebsiteConfig | null {
    try {
        return getWebsiteConfig();
    } catch (_) {
        return null;
    }
}

export function getMetadataDisplayNames(organism: string): Map<string, string> {
    return new Map(
        getWebsiteConfig().organisms[organism].schema.metadata.map(({ name, displayName }) => [
            name,
            displayName ?? name,
        ]),
    );
}

export type Organism = {
    key: string;
    displayName: string;
    image?: string;
};

export function getConfiguredOrganisms() {
    return Object.entries(getWebsiteConfig().organisms).map(([key, instance]) => ({
        key,
        displayName: instance.schema.organismName,
        image: instance.schema.image,
    }));
}

function getConfig(organism: string): InstanceConfig {
    const websiteConfig = getWebsiteConfig();
    if (!(organism in websiteConfig.organisms)) {
        throw new Error(`No configuration for organism ${organism}`);
    }
    return websiteConfig.organisms[organism];
}

export function outputFilesEnabled(organism: string): boolean {
    return (getConfig(organism).schema.files ?? []).length > 0;
}

export function getSchema(organism: string): Schema {
    return getConfig(organism).schema;
}

export function getMetadataTemplateFields(
    organism: string,
    action: 'submit' | 'revise',
): Map<string, string | undefined> {
    const schema = getConfig(organism).schema;
    const baseFields: string[] = schema.metadataTemplate ?? schema.inputFields.map((field) => field.name);
    const submissionIdInputFields = getSubmissionIdInputFields(schema).map((field) => field.name);
    const extraFields = action === 'submit' ? submissionIdInputFields : [ACCESSION_FIELD, ...submissionIdInputFields];
    const allFields = [...extraFields, ...baseFields];
    const fieldsToDisplaynames = new Map<string, string | undefined>(
        allFields.map((field) => [field, schema.metadata.find((metadata) => metadata.name === field)?.displayName]),
    );
    return fieldsToDisplaynames;
}

function getAccessionInputField(): InputField {
    const accessionPrefix = getWebsiteConfig().accessionPrefix;
    const instanceName = getWebsiteConfig().name;
    return {
        name: ACCESSION_FIELD,
        displayName: 'Accession',
        definition: `The ${instanceName} accession (without version) of the sequence you would like to revise.`,
        example: `${accessionPrefix}000P97Y`,
        noEdit: true,
        required: true,
    };
}

export function getSubmissionIdInputFields(schema: Schema): InputField[] {
    const maxSequencesPerEntry = schema.submissionDataTypes.maxSequencesPerEntry ?? Infinity;

    if (maxSequencesPerEntry == 1) {
        return [
            {
                name: SUBMISSION_ID_INPUT_FIELD,
                displayName: 'ID',
                definition: 'FASTA ID',
                guidance:
                    "Your sequence identifier; should match the sequence's id in the FASTA file - this is used to link the metadata to the FASTA sequence.",
                example: 'GJP123',
                noEdit: true,
                required: true,
            },
        ];
    }
    return [
        {
            name: SUBMISSION_ID_INPUT_FIELD,
            displayName: 'ID',
            definition: 'METADATA ID',
            guidance:
                'Your sample identifier. If FASTA IDS column is provided, this sample ID will be used to associate the metadata with the sequence.',
            example: 'GJP123',
            noEdit: true,
            required: true,
        },
        {
            name: FASTA_IDS_FIELD,
            displayName: 'FASTA IDS',
            definition: 'FASTA IDS',
            guidance: 'Space-separated list of FASTA IDS of each sequence to be associated with this metadata entry.',
            example: 'GJP123 GJP124',
            noEdit: true,
            desired: true,
        },
    ];
}

export function getGroupedInputFields(
    organism: string,
    action: 'submit' | 'revise',
    excludeDuplicates: boolean = false,
): Map<string, InputField[]> {
    const schema = getConfig(organism).schema;
    const submissionIdInputFields = getSubmissionIdInputFields(schema);

    const allFields = [
        ...submissionIdInputFields,
        ...(action === 'submit' ? [] : [getAccessionInputField()]),
        ...schema.inputFields,
    ];
    const requiredFields = allFields.filter((meta) => meta.required);
    const desiredFields = allFields.filter((meta) => meta.desired);

    const groups = new Map<string, InputField[]>();
    groups.set('Required fields', requiredFields);
    groups.set('Desired fields', desiredFields);
    if (!excludeDuplicates) groups.set('Submission details', submissionIdInputFields);
    const fieldAlreadyAdded = (fieldName: string) =>
        Array.from(groups.values())
            .flatMap((fields) => fields.map((f) => f.name))
            .some((name) => name === fieldName);

    schema.inputFields.forEach((field) => {
        const metadataEntry = schema.metadata.find((meta) => meta.name === field.name);
        const header = metadataEntry?.header ?? 'Uncategorized';

        if (!groups.has(header)) {
            groups.set(header, []);
        }

        // Optionally remove duplicates
        if (excludeDuplicates && fieldAlreadyAdded(field.name)) {
            return;
        }

        groups.get(header)!.push({ ...field });
    });

    return groups;
}

export function getRuntimeConfig(): RuntimeConfig {
    _runtimeConfig ??= readTypedConfigFile('runtime_config.json', runtimeConfig);
    return _runtimeConfig;
}

export function getLapisUrl(serviceConfig: ServiceUrls, organism: string): string {
    if (!(organism in serviceConfig.lapisUrls)) {
        throw new Error(`No lapis url configured for organism ${organism}`);
    }
    return serviceConfig.lapisUrls[organism];
}

export function getReferenceGenomes(organism: string): ReferenceGenomesInfo {
    return toReferenceGenomes(getConfig(organism).referenceGenomes);
}

export function seqSetsAreEnabled() {
    return getWebsiteConfig().enableSeqSets;
}

export function dataUseTermsAreEnabled() {
    return getWebsiteConfig().enableDataUseTerms;
}

function readTypedConfigFile<T>(fileName: string, schema: z.ZodType<T>) {
    const configFilePath = path.join(getConfigDir(), fileName);
    const json = JSON.parse(fs.readFileSync(configFilePath, 'utf8'));
    try {
        return schema.parse(json);
    } catch (e) {
        const zodError = e as ZodError;
        throw new Error(`Type error reading ${configFilePath}: ${zodError.message}`);
    }
}
