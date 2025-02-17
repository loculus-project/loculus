import fs from 'fs';
import path from 'path';

import type { z, ZodError } from 'zod';

import { ACCESSION_FIELD, SUBMISSION_ID_FIELD } from './settings.ts';
import {
    type InstanceConfig,
    type Schema,
    type WebsiteConfig,
    websiteConfig,
    type InputField,
} from './types/config.ts';
import { type ReferenceGenomes } from './types/referencesGenomes.ts';
import { runtimeConfig, type RuntimeConfig, type ServiceUrls } from './types/runtimeConfig.ts';

let _config: WebsiteConfig | null = null;
let _runtimeConfig: RuntimeConfig | null = null;

function getConfigDir(): string {
    const configDir = import.meta.env.CONFIG_DIR;
    if (typeof configDir !== 'string' || configDir === '') {
        throw new Error(`CONFIG_DIR environment variable was not set during build time, is '${configDir}'`);
    }
    return configDir;
}

function validateWebsiteConfig(config: WebsiteConfig): Error[] {
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
export function getGitHubReportUrl(organism: string, accessionVersion: string): string | undefined {
    const config = getWebsiteConfig();
    if (config.sequenceFlagging === undefined) return undefined;

    const ghConf = config.sequenceFlagging.github;
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
};

export function getConfiguredOrganisms() {
    return Object.entries(getWebsiteConfig().organisms).map(([key, instance]) => ({
        key,
        displayName: instance.schema.organismName,
        image: instance.schema.image,
        description: instance.schema.description,
    }));
}

function getConfig(organism: string): InstanceConfig {
    const websiteConfig = getWebsiteConfig();
    if (!(organism in websiteConfig.organisms)) {
        throw new Error(`No configuration for organism ${organism}`);
    }
    return websiteConfig.organisms[organism];
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
    const extraFields = action === 'submit' ? [SUBMISSION_ID_FIELD] : [ACCESSION_FIELD, SUBMISSION_ID_FIELD];
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

function getSubmissionIdInputField(): InputField {
    return {
        name: SUBMISSION_ID_FIELD,
        displayName: 'Submission ID',
        definition: 'FASTA ID',
        guidance:
            'Your sequence identifier; should match the FASTA file header - this is used to link the metadata to the FASTA sequence',
        example: 'GJP123',
        noEdit: true,
        required: true,
    };
}

export function getGroupedInputFields(
    organism: string,
    action: 'submit' | 'revise',
    excludeDuplicates: boolean = false,
): Map<string, InputField[]> {
    const inputFields = getConfig(organism).schema.inputFields;
    const metadata = getConfig(organism).schema.metadata;

    const groups = new Map<string, InputField[]>();

    const requiredFields = inputFields.filter((meta) => meta.required);
    const desiredFields = inputFields.filter((meta) => meta.desired);

    const coreFields =
        action === 'submit' ? [getSubmissionIdInputField()] : [getSubmissionIdInputField(), getAccessionInputField()];

    groups.set('Required fields', [...coreFields, ...requiredFields]);
    groups.set('Desired fields', desiredFields);
    if (!excludeDuplicates) groups.set('Submission details', [getSubmissionIdInputField()]);

    const fieldAlreadyAdded = (fieldName: string) =>
        Array.from(groups.values())
            .flatMap((fields) => fields.map((f) => f.name))
            .some((name) => name === fieldName);

    inputFields.forEach((field) => {
        const metadataEntry = metadata.find((meta) => meta.name === field.name);
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
    if (_runtimeConfig === null) {
        _runtimeConfig = readTypedConfigFile('runtime_config.json', runtimeConfig);
    }
    return _runtimeConfig;
}

export function getLapisUrl(serviceConfig: ServiceUrls, organism: string): string {
    if (!(organism in serviceConfig.lapisUrls)) {
        throw new Error(`No lapis url configured for organism ${organism}`);
    }
    return serviceConfig.lapisUrls[organism];
}

export function getReferenceGenomes(organism: string): ReferenceGenomes {
    return getConfig(organism).referenceGenomes;
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
