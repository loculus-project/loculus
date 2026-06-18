import { parse as parseYaml } from 'yaml';

import {
    type Schema,
    type WebsiteConfig,
    type InstanceConfig as PerOrganismConfig,
    type OverviewConfig,
    type ViewConfig,
    viewConfig,
    schema as websiteSchema,
    websiteConfig,
} from '../types/config.ts';
import {
    commonMetadata,
    type CanonicalInstanceResponse,
    type CanonicalOrganismConfig,
    type CanonicalReferenceGenome,
    type CanonicalSchema,
} from '../types/loculusConfig.ts';
import { type ReferenceGenomesSchema } from '../types/referencesGenomes.ts';

export function toWebsiteConfig(
    instance: CanonicalInstanceResponse,
    organisms: Record<string, CanonicalOrganismConfig>,
): WebsiteConfig {
    const common = commonMetadata(instance.config);
    const organismsView: Record<string, PerOrganismConfig> = {};
    for (const [key, organism] of Object.entries(organisms)) {
        organismsView[key] = {
            schema: toSchema(organism.schema, organism, common),
            referenceGenomes: toReferenceGenomes(organism),
        };
    }

    const i = instance.config;
    const views = toViewConfigs(instance);
    return websiteConfig.parse({
        name: i.name,
        accessionPrefix: i.accessionPrefix,
        organisms: organismsView,
        views,
        overview: views[OVERVIEW_ORGANISM_KEY],
        logo: {
            url: i.logo?.url ?? '',
            width: i.logo?.width ?? 0,
            height: i.logo?.height ?? 0,
        },
        bannerMessage: i.bannerMessage ?? undefined,
        bannerMessageURL: i.bannerMessageURL ?? undefined,
        submissionBannerMessage: i.submissionBannerMessage ?? undefined,
        submissionBannerMessageURL: i.submissionBannerMessageURL ?? undefined,
        welcomeMessageHTML: i.welcomeMessageHTML ?? undefined,
        additionalHeadHTML: i.additionalHeadHTML ?? undefined,
        gitHubEditLink: i.gitHubEditLink ?? undefined,
        gitHubMainUrl: i.gitHubMainUrl ?? undefined,
        gitHubIssuesUrl: i.gitHubIssuesUrl ?? undefined,
        issuesEmail: i.issuesEmail ?? undefined,
        enableSeqSets: i.enableSeqSets,
        seqSetsFieldsToDisplay: i.seqSetsFieldsToDisplay ?? undefined,
        seqSetsGraphs: i.seqSetsGraphs ?? undefined,
        enableLoginNavigationItem: i.enableLoginNavigationItem,
        enableSubmissionNavigationItem: i.enableSubmissionNavigationItem,
        enableSubmissionPages: i.enableSubmissionPages,
        enableDataUseTerms: i.dataUseTerms.enabled,
        readOnlyMode: instance.readOnlyMode,
        dataUseTermsAgreementHTML: i.dataUseTermsAgreementHTML ?? undefined,
        sequenceFlagging: i.sequenceFlagging ?? undefined,
        dateFieldForGroupGraph: i.dateFieldForGroupGraph ?? null,
    });
}

// Key under which the cross-organism overview is addressed (route, LAPIS proxy).
export const OVERVIEW_ORGANISM_KEY = 'overview';

function toViewConfigs(instance: CanonicalInstanceResponse): Record<string, ViewConfig> {
    const views: Record<string, ViewConfig> = {};
    if (instance.config.overview) {
        views[OVERVIEW_ORGANISM_KEY] = toViewConfig(OVERVIEW_ORGANISM_KEY, instance.config.overview);
    }
    for (const [key, view] of Object.entries(instance.config.views)) {
        views[key] = toViewConfig(key, view);
    }
    return views;
}

type CanonicalViewConfig = NonNullable<CanonicalInstanceResponse['config']['overview']>;

// Build a pseudo-organism config from an instance-level SQL view. View fields
// come from the manual SILO schema that describes the admin-provided SQL query
// output; unaligned nucleotide sequences are opt-in.
function toViewConfig(key: string, view: CanonicalViewConfig): OverviewConfig {
    const ov = view;
    const sequenceSegments = viewSequenceSegments(ov);

    const isVisible = (name: string): boolean => ov.tableColumns.includes(name);
    const siloSchema = parseOverviewSiloSchema(ov.schema);
    const metadata = siloSchema.schema.metadata.map((field) => ({
        ...stripNulls(field),
        type: toWebsiteMetadataType(field.type),
        initiallyVisible: field.initiallyVisible ?? isVisible(field.name),
    }));

    const schema = websiteSchema.parse({
        organismName: ov.displayName,
        metadata,
        inputFields: [],
        tableColumns: ov.tableColumns,
        primaryKey: siloSchema.schema.primaryKey,
        defaultOrderBy: siloSchema.schema.defaultOrderBy ?? siloSchema.schema.primaryKey,
        defaultOrder: siloSchema.schema.defaultOrder ?? 'ascending',
        submissionDataTypes: { consensusSequences: sequenceSegments.length > 0 },
    });

    return viewConfig.parse({
        key,
        displayName: ov.displayName,
        schema,
        referenceGenomes: viewReferenceGenomes(sequenceSegments),
    });
}

function viewSequenceSegments(view: CanonicalViewConfig): string[] {
    const sequenceConfig = view.sequenceData?.unalignedNucleotideSequences;
    if (sequenceConfig?.enabled !== true) return [];
    return sequenceConfig.segments;
}

function viewReferenceGenomes(segments: string[]): ReferenceGenomesSchema {
    return segments.map((segment) => ({
        name: segment,
        references: [
            {
                name: segment,
                // Synthetic placeholder: view sequences are unaligned only.
                sequence: 'N',
            },
        ],
    }));
}

type OverviewSiloSchema = {
    schema: {
        metadata: (Omit<Schema['metadata'][number], 'type'> & { type: string })[];
        primaryKey: string;
        defaultOrderBy?: string;
        defaultOrder?: string;
    };
};

function parseOverviewSiloSchema(schemaYaml: string): OverviewSiloSchema {
    const parsed = parseYaml(schemaYaml) as Partial<OverviewSiloSchema> | null;
    if (!parsed?.schema || !Array.isArray(parsed.schema.metadata)) {
        throw new Error('Invalid overview schema: expected schema.metadata');
    }
    if (!parsed.schema.primaryKey) {
        throw new Error('Invalid overview schema: expected schema.primaryKey');
    }
    return parsed as OverviewSiloSchema;
}

function toWebsiteMetadataType(type: string): Schema['metadata'][number]['type'] {
    if (type === 'int') return 'int';
    if (type === 'float') return 'float';
    if (type === 'number') return 'number';
    if (type === 'date') return 'date';
    if (type === 'boolean') return 'boolean';
    if (type === 'timestamp') return 'timestamp';
    if (type === 'authors') return 'authors';
    return 'string';
}

function toSchema(
    canonical: CanonicalSchema,
    organism: CanonicalOrganismConfig,
    common: ReturnType<typeof commonMetadata>,
): Schema {
    const commonNames = new Set(common.map((c) => c.name));
    const organismMetadata = canonical.metadata.filter((m) => !commonNames.has(m.name));
    const mergedMetadata = [...common, ...organismMetadata.map(stripNulls), ...fileMetadata(canonical)];
    return websiteSchema.parse({
        // Prefer the canonical OrganismConfig.displayName; fall back to the
        // legacy schema.organismName for organisms whose first PUT'd version
        // pre-dates the displayName field.
        organismName: organism.displayName ?? canonical.organismName,
        image: canonical.image ?? organism.image?.url ?? undefined,
        files: canonical.files.map(stripNulls),
        metadata: mergedMetadata,
        metadataTemplate: canonical.metadataTemplate ?? undefined,
        inputFields: canonical.inputFields.map(stripNulls),
        tableColumns: canonical.tableColumns,
        primaryKey: canonical.primaryKey ?? 'accessionVersion',
        defaultOrderBy: canonical.defaultOrderBy ?? 'submittedAtTimestamp',
        defaultOrder: canonical.defaultOrder ?? 'descending',
        submissionDataTypes: toSubmissionDataTypes(canonical),
        loadSequencesAutomatically: canonical.loadSequencesAutomatically ?? undefined,
        richFastaHeaderFields: canonical.richFastaHeaderFields ?? undefined,
        linkOuts: canonical.linkOuts.length > 0 ? canonical.linkOuts.map(stripNulls) : undefined,
        referenceIdentifierField: canonical.referenceIdentifierField ?? undefined,
        multiFieldSearches: canonical.multiFieldSearches?.map(stripNulls) ?? undefined,
    });
}

function fileMetadata(canonical: CanonicalSchema): Schema['metadata'] {
    return canonical.files.map((file) => ({
        name: file.name,
        displayName: file.displayName ?? undefined,
        type: 'string',
        header: 'Files',
        customDisplay: {
            type: 'fileList',
        },
    }));
}

function toSubmissionDataTypes(canonical: CanonicalSchema): Schema['submissionDataTypes'] {
    if (!canonical.submissionDataTypes) {
        return { consensusSequences: true };
    }

    return {
        consensusSequences: canonical.submissionDataTypes.consensusSequences,
        maxSequencesPerEntry: canonical.submissionDataTypes.maxSequencesPerEntry ?? undefined,
        files: canonical.submissionDataTypes.files
            ? {
                  ...canonical.submissionDataTypes.files,
                  categories: canonical.submissionDataTypes.files.categories.map((category) => ({
                      name: category.name,
                      displayName: category.displayName ?? undefined,
                  })),
              }
            : undefined,
    };
}

function toReferenceGenomes(organism: CanonicalOrganismConfig): ReferenceGenomesSchema {
    if (organism.referenceGenomes && organism.referenceGenomes.length > 0) {
        return organism.referenceGenomes.map((seg) => ({
            name: seg.name,
            displayName: seg.displayName ?? undefined,
            references: seg.references.map((r) => ({
                name: r.name,
                displayName: r.displayName ?? undefined,
                sequence: r.sequence,
                insdcAccessionFull: r.insdcAccessionFull ?? undefined,
                genes: r.genes ?? undefined,
            })),
        }));
    }
    return fromSimpleReferenceGenome(organism.referenceGenome);
}

function fromSimpleReferenceGenome(simple: CanonicalReferenceGenome): ReferenceGenomesSchema {
    const flatGenes = simple.genes.map((g) => ({ name: g.name, sequence: g.sequence }));
    return simple.nucleotideSequences.map((seg, idx) => ({
        name: seg.name,
        references: [
            {
                name: seg.name,
                sequence: seg.sequence,
                genes: idx === 0 ? flatGenes : undefined,
            },
        ],
    }));
}

function stripNulls<T extends Record<string, unknown>>(input: T): T {
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(input)) {
        if (v !== null) result[k] = v;
    }
    return result as T;
}
