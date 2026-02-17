/**
 * Config generation functions.
 * Replaces _common-metadata.tpl and related helpers.
 * Generates the JSON content for backend-config, website-config, etc.
 */

import { LoculusValues, MetadataField, OrganismConfig, ReferenceGenomeSegment } from './values';
import {
  getEnabledOrganisms,
  patchMetadataSchema,
  getNucleotideSegmentNames,
  isSegmented,
  mergeReferenceGenomes,
  lineageSystemForOrganism,
  flattenPreprocessingVersions,
} from './organisms';
import {
  backendUrl,
  websiteUrl,
  keycloakUrl,
  lapisUrlTemplate,
  generateExternalLapisUrls,
  generateInternalLapisUrls,
} from './urls';

/** Common metadata fields required for all organisms */
function commonMetadataFields(values: LoculusValues): MetadataField[] {
  const fields: MetadataField[] = [
    {
      name: 'accessionVersion',
      type: 'string',
      notSearchable: true,
      hideOnSequenceDetailsPage: true,
      includeInDownloadsByDefault: true,
    },
    { name: 'accession', type: 'string', notSearchable: true, hideOnSequenceDetailsPage: true },
    { name: 'version', type: 'int', hideOnSequenceDetailsPage: true },
    {
      name: 'submissionId',
      displayName: 'Submission ID',
      type: 'string',
      header: 'Submission details',
      orderOnDetailsPage: 5000,
      enableSubstringSearch: true,
      includeInDownloadsByDefault: true,
    },
    {
      name: 'isRevocation',
      displayName: 'Is revocation',
      type: 'boolean',
      autocomplete: true,
      hideOnSequenceDetailsPage: true,
    },
    {
      name: 'submitter',
      type: 'string',
      generateIndex: true,
      autocomplete: true,
      hideOnSequenceDetailsPage: true,
      header: 'Submission details',
      orderOnDetailsPage: 5010,
    },
    {
      name: 'groupName',
      type: 'string',
      generateIndex: true,
      autocomplete: true,
      header: 'Submission details',
      displayName: 'Submitting group',
      includeInDownloadsByDefault: true,
      orderOnDetailsPage: 5020,
      customDisplay: { type: 'submittingGroup', displayGroup: 'group' },
    },
    {
      name: 'groupId',
      type: 'int',
      autocomplete: true,
      header: 'Submission details',
      displayName: 'Submitting group (numeric ID)',
      orderOnDetailsPage: 5030,
      customDisplay: { type: 'submittingGroup', displayGroup: 'group' },
    },
    {
      name: 'submittedAtTimestamp',
      type: 'timestamp',
      displayName: 'Date submitted',
      header: 'Submission details',
      orderOnDetailsPage: 5040,
    },
    {
      name: 'submittedDate',
      type: 'string',
      hideOnSequenceDetailsPage: true,
      generateIndex: true,
      autocomplete: true,
      displayName: 'Date submitted (exact)',
      orderOnDetailsPage: 5050,
    },
    {
      name: 'releasedAtTimestamp',
      type: 'timestamp',
      displayName: 'Date released',
      header: 'Submission details',
      columnWidth: 100,
      orderOnDetailsPage: 5060,
    },
    {
      name: 'releasedDate',
      type: 'string',
      hideOnSequenceDetailsPage: true,
      generateIndex: true,
      autocomplete: true,
      displayName: 'Date released (exact)',
      columnWidth: 100,
      orderOnDetailsPage: 5070,
    },
  ];

  if (values.dataUseTerms.enabled) {
    fields.push(
      {
        name: 'dataUseTerms',
        type: 'string',
        generateIndex: true,
        autocomplete: true,
        displayName: 'Data use terms',
        initiallyVisible: true,
        includeInDownloadsByDefault: true,
        customDisplay: { type: 'dataUseTerms' },
        header: 'Data use terms',
        orderOnDetailsPage: 610,
      },
      {
        name: 'dataUseTermsRestrictedUntil',
        type: 'date',
        displayName: 'Data use terms restricted until',
        hideOnSequenceDetailsPage: true,
        header: 'Data use terms',
        orderOnDetailsPage: 620,
      },
      {
        name: 'dataBecameOpenAt',
        type: 'date',
        displayName: 'Date data became open',
        hideOnSequenceDetailsPage: true,
        header: 'Data use terms',
        orderOnDetailsPage: 625,
      },
    );
    if (values.dataUseTerms.urls) {
      fields.push({
        name: 'dataUseTermsUrl',
        displayName: 'Data use terms URL',
        type: 'string',
        notSearchable: true,
        header: 'Data use terms',
        includeInDownloadsByDefault: true,
        customDisplay: { type: 'link', url: '__value__' },
        orderOnDetailsPage: 630,
      });
    }
  }

  fields.push(
    {
      name: 'versionStatus',
      displayName: 'Version status',
      type: 'string',
      autocomplete: true,
      hideOnSequenceDetailsPage: true,
    },
    {
      name: 'versionComment',
      type: 'string',
      displayName: 'Version comment',
      header: 'Submission details',
      orderOnDetailsPage: 5000,
    },
    { name: 'pipelineVersion', type: 'int', notSearchable: true, hideOnSequenceDetailsPage: true },
  );

  return fields;
}

/** Generate standard website metadata entry */
function standardWebsiteMetadata(field: MetadataField): any {
  const entry: any = {
    type: field.type || 'string',
  };
  if (field.autocomplete) entry.autocomplete = field.autocomplete;
  if (field.enableSubstringSearch) entry.substringSearch = field.enableSubstringSearch;
  if (field.notSearchable) entry.notSearchable = field.notSearchable;
  if (field.initiallyVisible) entry.initiallyVisible = field.initiallyVisible;
  if (field.hideInSearchResultsTable) entry.hideInSearchResultsTable = field.hideInSearchResultsTable;
  if (field.type === 'timestamp' || field.type === 'date' || field.rangeSearch) entry.rangeSearch = true;
  if (field.rangeOverlapSearch) entry.rangeOverlapSearch = field.rangeOverlapSearch;
  if (field.lineageSystem) entry.lineageSearch = true;
  if (field.hideOnSequenceDetailsPage) entry.hideOnSequenceDetailsPage = field.hideOnSequenceDetailsPage;
  if (field.columnWidth) entry.columnWidth = field.columnWidth;
  if (field.order) entry.order = field.order;
  if (field.orderOnDetailsPage) entry.orderOnDetailsPage = field.orderOnDetailsPage;
  if (field.includeInDownloadsByDefault) entry.includeInDownloadsByDefault = field.includeInDownloadsByDefault;
  if (field.onlyForReference) entry.onlyForReference = field.onlyForReference;
  if (field.customDisplay) {
    entry.customDisplay = { type: field.customDisplay.type };
    if (field.customDisplay.url) entry.customDisplay.url = field.customDisplay.url;
    if (field.customDisplay.linkMenuItems) entry.customDisplay.linkMenuItems = field.customDisplay.linkMenuItems;
    if (field.customDisplay.displayGroup) entry.customDisplay.displayGroup = field.customDisplay.displayGroup;
    if (field.customDisplay.label) entry.customDisplay.label = field.customDisplay.label;
    if (field.customDisplay.html) entry.customDisplay.html = field.customDisplay.html;
  }
  return entry;
}

/** Generate website metadata from metadata array + reference genomes */
function generateWebsiteMetadata(metadata: MetadataField[], referenceGenomes: ReferenceGenomeSegment[]): any[] {
  const segments = getNucleotideSegmentNames(referenceGenomes);
  const segmented = isSegmented(referenceGenomes);
  const fields: any[] = [];

  for (const field of metadata) {
    if (segmented && field.perSegment) {
      for (const segment of segments) {
        const entry = standardWebsiteMetadata(field);
        entry.name = `${field.name}_${segment}`;
        if (field.displayName) entry.displayName = `${field.displayName} ${segment}`;
        if (field.oneHeader) {
          entry.header = field.header || 'Other';
        } else {
          entry.header = `${field.header || 'Other'} ${segment}`;
        }
        if (field.customDisplay?.displayGroup) {
          entry.customDisplay = {
            type: field.customDisplay.type,
            displayGroup: `${field.customDisplay.displayGroup}_${segment}`,
          };
          if (field.customDisplay.label) {
            entry.customDisplay.label = `${field.customDisplay.label} ${segment}`;
          }
        }
        fields.push(entry);
      }
    } else {
      const entry = standardWebsiteMetadata(field);
      entry.name = field.name;
      if (field.displayName) entry.displayName = field.displayName;
      entry.header = field.header || 'Other';
      fields.push(entry);
    }
  }

  return fields;
}

/** Generate backend metadata */
function generateBackendMetadata(metadata: MetadataField[], referenceGenomes: ReferenceGenomeSegment[]): any[] {
  const segments = getNucleotideSegmentNames(referenceGenomes);
  const segmented = isSegmented(referenceGenomes);
  const fields: any[] = [];

  for (const field of metadata) {
    if (segmented && field.perSegment) {
      for (const segment of segments) {
        fields.push({ name: `${field.name}_${segment}`, type: field.type || 'string' });
      }
    } else {
      fields.push({ name: field.name, type: field.type || 'string' });
    }
  }
  fields.push({ name: 'versionComment', type: 'string' });
  return fields;
}

/** Generate backend external metadata (INSDC header fields) */
function generateBackendExternalMetadata(metadata: MetadataField[], referenceGenomes: ReferenceGenomeSegment[]): any[] {
  const segments = getNucleotideSegmentNames(referenceGenomes);
  const segmented = isSegmented(referenceGenomes);
  const fields: any[] = [];

  for (const field of metadata) {
    if (field.header === 'INSDC') {
      if (segmented && field.perSegment) {
        for (const segment of segments) {
          const entry: any = {
            name: `${field.name}_${segment}`,
            type: field.type || 'string',
            externalMetadataUpdater: 'ena',
          };
          if (field.required) entry.required = field.required;
          fields.push(entry);
        }
      } else {
        const entry: any = { name: field.name, type: field.type || 'string', externalMetadataUpdater: 'ena' };
        if (field.required) entry.required = field.required;
        fields.push(entry);
      }
    }
  }
  return fields;
}

/** Generate submission data types config */
function submissionDataTypes(schema: any): any {
  const result: any = {};
  if (schema.submissionDataTypes) {
    result.consensusSequences =
      schema.submissionDataTypes.consensusSequences !== undefined
        ? schema.submissionDataTypes.consensusSequences
        : true;
    if (schema.submissionDataTypes.maxSequencesPerEntry !== undefined) {
      result.maxSequencesPerEntry = schema.submissionDataTypes.maxSequencesPerEntry;
    }
    if (schema.submissionDataTypes.files !== undefined) {
      result.files = schema.submissionDataTypes.files;
    }
  } else {
    result.consensusSequences = true;
  }
  return result;
}

/** Generate input fields (filtering out noInput and ordering with extraInputFields) */
function generateInputFields(schema: any): any[] {
  const metadata = schema.metadata || [];
  const extraFields = schema.extraInputFields || [];
  const TO_KEEP = [
    'name',
    'displayName',
    'definition',
    'guidance',
    'example',
    'required',
    'noEdit',
    'desired',
    'options',
  ];

  const orderedFields: any[] = [];

  // Add fields with position "first"
  for (const field of extraFields) {
    if (field.position === 'first') orderedFields.push(field);
  }

  // Add filtered metadata fields (exclude noInput)
  for (const field of metadata) {
    if (!field.noInput) orderedFields.push(field);
  }

  // Add fields with position "last"
  for (const field of extraFields) {
    if (field.position === 'last') orderedFields.push(field);
  }

  // Filter to only keep allowed keys
  return orderedFields.map((field) => {
    const filtered: any = {};
    for (const key of TO_KEEP) {
      if (key in field) filtered[key] = field[key];
    }
    return filtered;
  });
}

/** Generate the full website config JSON */
export function generateWebsiteConfig(values: LoculusValues): any {
  const common = commonMetadataFields(values);
  const config: any = {
    name: values.name,
    logo: values.logo,
  };

  if (values.sequenceFlagging) config.sequenceFlagging = values.sequenceFlagging;
  if (values.gitHubMainUrl) config.gitHubMainUrl = values.gitHubMainUrl;
  if (values.bannerMessageURL) config.bannerMessageURL = values.bannerMessageURL;
  if (values.bannerMessage) {
    config.bannerMessage = values.bannerMessage;
  } else if (values.runDevelopmentMainDatabase || values.runDevelopmentKeycloakDatabase) {
    config.bannerMessage = 'Warning: Development or Keycloak main database is enabled. Development environment only.';
  }
  if (values.submissionBannerMessageURL) config.submissionBannerMessageURL = values.submissionBannerMessageURL;
  if (values.submissionBannerMessage) config.submissionBannerMessage = values.submissionBannerMessage;
  if (values.gitHubEditLink) config.gitHubEditLink = values.gitHubEditLink;
  if (values.welcomeMessageHTML) config.welcomeMessageHTML = values.welcomeMessageHTML;
  if (values.additionalHeadHTML) config.additionalHeadHTML = values.additionalHeadHTML;

  config.enableLoginNavigationItem = values.website.websiteConfig.enableLoginNavigationItem;
  config.enableSubmissionNavigationItem = values.website.websiteConfig.enableSubmissionNavigationItem;
  config.enableSubmissionPages = values.website.websiteConfig.enableSubmissionPages;
  config.enableSeqSets = values.seqSets.enabled;
  if (values.seqSets.fieldsToDisplay) config.seqSetsFieldsToDisplay = values.seqSets.fieldsToDisplay;
  config.enableDataUseTerms = values.dataUseTerms.enabled;
  config.accessionPrefix = values.accessionPrefix;

  config.organisms = {};
  for (const org of getEnabledOrganisms(values)) {
    const instance = org.contents;
    const patchedSchema = patchMetadataSchema(instance.schema);
    const allMetadata = [...common, ...patchedSchema.metadata];
    const websiteMetadata = generateWebsiteMetadata(allMetadata, instance.referenceGenomes);

    const organismConfig: any = {
      schema: {
        organismName: patchedSchema.organismName,
      },
    };

    if (patchedSchema.linkOuts) {
      organismConfig.schema.linkOuts = patchedSchema.linkOuts.map((lo: any) => {
        const entry: any = { name: lo.name, url: lo.url };
        if (lo.maxNumberOfRecommendedEntries) entry.maxNumberOfRecommendedEntries = lo.maxNumberOfRecommendedEntries;
        return entry;
      });
    }

    organismConfig.schema.loadSequencesAutomatically = patchedSchema.loadSequencesAutomatically || false;
    if (patchedSchema.richFastaHeaderFields)
      organismConfig.schema.richFastaHeaderFields = patchedSchema.richFastaHeaderFields;

    organismConfig.schema.submissionDataTypes = submissionDataTypes(patchedSchema);

    if (patchedSchema.image) organismConfig.schema.image = patchedSchema.image;
    if (patchedSchema.description) organismConfig.schema.description = patchedSchema.description;

    organismConfig.schema.primaryKey = 'accessionVersion';

    const inputFields = generateInputFields(patchedSchema);
    inputFields.push({
      name: 'versionComment',
      displayName: 'Version comment',
      definition: 'Reason for revising sequences or other general comments concerning a specific version',
      example:
        'Fixed an issue in previous version where low-coverage nucleotides were erroneously filled with reference sequence',
      desired: true,
    });
    organismConfig.schema.inputFields = inputFields;

    if (patchedSchema.files) organismConfig.schema.files = patchedSchema.files;

    // Website metadata + file entries
    const metadataEntries = [...websiteMetadata];
    if (patchedSchema.files) {
      for (const file of patchedSchema.files) {
        metadataEntries.push({
          name: file.name,
          type: 'string',
          header: 'Files',
          noInput: true,
          customDisplay: { type: 'fileList' },
        });
      }
    }
    organismConfig.schema.metadata = metadataEntries;

    if (patchedSchema.metadataTemplate) organismConfig.schema.metadataTemplate = patchedSchema.metadataTemplate;

    // Merge website-specific config from schema
    if (patchedSchema.website) {
      Object.assign(organismConfig.schema, patchedSchema.website);
    }

    organismConfig.referenceGenomes = instance.referenceGenomes;
    config.organisms[org.key] = organismConfig;
  }

  return config;
}

/** Generate the full backend config JSON */
export function generateBackendConfig(values: LoculusValues): any {
  const config: any = {
    accessionPrefix: values.accessionPrefix,
    zstdCompressionLevel: values.zstdCompressionLevel,
    pipelineVersionUpgradeCheckIntervalSeconds: values.pipelineVersionUpgradeCheckIntervalSeconds,
    name: values.name,
    dataUseTerms: values.dataUseTerms,
  };

  if (values.fileSharing) config.fileSharing = values.fileSharing;

  config.websiteUrl = websiteUrl(values);
  config.backendUrl = backendUrl(values);

  config.organisms = {};
  for (const org of getEnabledOrganisms(values)) {
    const instance = org.contents;
    const patchedSchema = patchMetadataSchema(instance.schema);
    // Backend config uses ONLY organism-specific metadata (NOT common metadata fields)
    const backendMeta = generateBackendMetadata(patchedSchema.metadata, instance.referenceGenomes);
    const externalMeta = generateBackendExternalMetadata(patchedSchema.metadata, instance.referenceGenomes);

    const organismConfig: any = {
      schema: {
        organismName: patchedSchema.organismName,
        submissionDataTypes: submissionDataTypes(patchedSchema),
        metadata: backendMeta,
        externalMetadata: externalMeta.length > 0 ? externalMeta : [],
        earliestReleaseDate: patchedSchema.earliestReleaseDate || { enabled: false, externalFields: [] },
      },
      referenceGenome: mergeReferenceGenomes(instance.referenceGenomes),
    };

    if (patchedSchema.files) organismConfig.schema.files = patchedSchema.files;

    config.organisms[org.key] = organismConfig;
  }

  return config;
}

/** Generate the public runtime config section */
export function generatePublicRuntimeConfig(values: LoculusValues): any {
  return {
    backendUrl: backendUrl(values),
    lapisUrls: generateExternalLapisUrls(values),
    keycloakUrl: keycloakUrl(values),
  };
}

/** Generate runtime config for website */
export function generateRuntimeConfig(values: LoculusValues): any {
  const config: any = {
    name: values.name,
    insecureCookies: values.insecureCookies || false,
    serverSide: {} as any,
    public: generatePublicRuntimeConfig(values),
    backendKeycloakClientSecret: '[[backendKeycloakClientSecret]]',
  };

  if (values.usePublicRuntimeConfigAsServerSide) {
    config.serverSide = generatePublicRuntimeConfig(values);
  } else {
    let serverBackendUrl: string;
    if (values.disableBackend) {
      serverBackendUrl = `http://${values.localHost}:8079`;
    } else {
      serverBackendUrl = 'http://loculus-backend-service:8079';
    }

    let serverKeycloakUrl: string;
    if (!values.disableWebsite) {
      serverKeycloakUrl = 'http://loculus-keycloak-service:8083';
    } else {
      serverKeycloakUrl = `http://${values.localHost}:8083`;
    }

    config.serverSide = {
      backendUrl: serverBackendUrl,
      lapisUrls: generateInternalLapisUrls(values),
      keycloakUrl: serverKeycloakUrl,
    };
  }

  return config;
}

/** Generate SILO database config for an organism */
export function generateSiloDatabaseConfig(
  schema: any,
  commonMeta: MetadataField[],
  referenceGenomes: ReferenceGenomeSegment[],
): any {
  const segments = getNucleotideSegmentNames(referenceGenomes);
  const segmented = isSegmented(referenceGenomes);
  const allMetadata = [...commonMeta, ...schema.metadata];

  const metadata: any[] = [];
  for (const field of allMetadata) {
    if (segmented && field.perSegment) {
      for (const segment of segments) {
        metadata.push(siloMetadataEntry(field, `${field.name}_${segment}`));
      }
    } else {
      metadata.push(siloMetadataEntry(field, field.name));
    }
  }

  // Add file fields
  if (schema.files) {
    for (const file of schema.files) {
      metadata.push({ type: 'string', name: file.name });
    }
  }

  return {
    schema: {
      instanceName: schema.organismName,
      opennessLevel: 'OPEN',
      metadata,
      primaryKey: 'accessionVersion',
      features: [{ name: 'generalizedAdvancedQuery' }],
    },
  };
}

function siloMetadataEntry(field: MetadataField, name: string): any {
  const type = field.type || 'string';
  const siloType = type === 'timestamp' ? 'int' : type === 'authors' ? 'string' : type;
  const entry: any = { type: siloType, name };
  if (field.generateIndex) entry.generateIndex = field.generateIndex;
  if (field.lineageSystem) {
    entry.generateIndex = true;
    entry.generateLineageIndex = 'lineage_definitions';
  }
  return entry;
}

/** Generate preprocessing specs for an organism */
export function generatePreprocessingSpecs(
  metadata: MetadataField[],
  referenceGenomes: ReferenceGenomeSegment[],
): Record<string, any> {
  const segments = getNucleotideSegmentNames(referenceGenomes);
  const segmented = isSegmented(referenceGenomes);
  const specs: Record<string, any> = {};

  for (const field of metadata) {
    if (segmented && field.perSegment) {
      for (const segment of segments) {
        const key = `${field.name}_${segment}`;
        specs[key] = sharedPreproSpec(field, segment);
      }
    } else {
      specs[field.name] = sharedPreproSpec(field, '');
    }
  }

  return specs;
}

function sharedPreproSpec(field: MetadataField, segment: string): any {
  const spec: any = {};

  if (field.preprocessing) {
    spec.function = field.preprocessing.function || 'identity';
    if (field.preprocessing.inputs) {
      spec.inputs = { ...field.preprocessing.inputs };
    }
    const args: any = {};
    if (segment) args.segment = segment;
    if (field.type) args.type = field.type;
    if (field.options) {
      args.options = field.options.map((o: any) => o.name);
    }
    if (field.preprocessing.args) {
      Object.assign(args, field.preprocessing.args);
    }
    spec.args = Object.keys(args).length > 0 ? args : null;
  } else {
    spec.function = 'identity';
    spec.inputs = {
      input: segment ? `${field.name}_${segment}` : field.name,
    };
    const args: any = {};
    if (segment) args.segment = segment;
    if (field.type) args.type = field.type;
    spec.args = Object.keys(args).length > 0 ? args : null;
  }

  if (field.required) spec.required = true;
  return spec;
}

/** Generate ENA submission config */
export function generateENASubmissionConfig(values: LoculusValues): any {
  const enaOrganisms: Record<string, any> = {};

  for (const org of getEnabledOrganisms(values)) {
    const instance = org.contents;
    if (!instance.enaDeposition) continue;

    for (const [suborganismName, configFileRaw] of Object.entries(instance.enaDeposition)) {
      const configFile = configFileRaw as any;
      const patchedSchema = patchMetadataSchema(instance.schema);
      const segments = getNucleotideSegmentNames(instance.referenceGenomes);
      const externalMeta = generateBackendExternalMetadata(patchedSchema.metadata, instance.referenceGenomes);

      const entry: any = {};
      if (suborganismName !== 'singleReference') {
        entry.loculusOrganism = org.key;
      }
      if (configFile.configFile) {
        Object.assign(entry, configFile.configFile);
      }
      if (configFile.referenceIdentifierField) {
        entry.referenceIdentifierField = configFile.referenceIdentifierField;
      }
      entry.organismName = patchedSchema.organismName;
      entry.segments = segments;
      entry.externalMetadata = externalMeta.length > 0 ? externalMeta : [];

      const key = suborganismName === 'singleReference' ? org.key : suborganismName;
      enaOrganisms[key] = entry;
    }
  }

  return enaOrganisms;
}

/** Generate ingest rename mapping */
export function generateIngestRename(metadata: MetadataField[]): Record<string, string> {
  const rename: Record<string, string> = {};
  for (const field of metadata) {
    if (field.ingest) {
      rename[field.ingest] = field.name;
    }
  }
  return rename;
}
