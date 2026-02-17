import * as fs from 'fs';
import * as yaml from 'js-yaml';
import * as path from 'path';

// TypeScript interfaces matching values.yaml structure
// These are intentionally loose (using `any` for deeply nested configs)
// to avoid maintaining a 1785-line JSON Schema in TypeScript

export interface MetadataField {
  name: string;
  displayName?: string;
  type?: string;
  header?: string;
  required?: boolean;
  noInput?: boolean;
  noEdit?: boolean;
  desired?: boolean;
  definition?: string;
  guidance?: string;
  example?: string;
  ontology_id?: string;
  options?: Array<{ name: string; [key: string]: any }>;
  ingest?: string;
  preprocessing?: {
    function?: string;
    inputs?: Record<string, string>;
    args?: Record<string, any>;
  };
  generateIndex?: boolean;
  autocomplete?: boolean;
  notSearchable?: boolean;
  initiallyVisible?: boolean;
  hideInSearchResultsTable?: boolean;
  hideOnSequenceDetailsPage?: boolean;
  includeInDownloadsByDefault?: boolean;
  rangeSearch?: boolean;
  rangeOverlapSearch?: any;
  lineageSystem?: string;
  perSegment?: boolean;
  oneHeader?: boolean;
  columnWidth?: number;
  order?: number;
  orderOnDetailsPage?: number;
  onlyForReference?: string;
  enableSubstringSearch?: boolean;
  customDisplay?: {
    type: string;
    url?: string;
    linkMenuItems?: Array<{ name: string; url: string }>;
    displayGroup?: string;
    label?: string;
    html?: string;
  };
  [key: string]: any;
}

export interface ReferenceGenomeSegment {
  name: string;
  references: Array<{
    name: string;
    sequence: string;
    genes?: Array<{ name: string; sequence: string }>;
  }>;
}

export interface OrganismSchema {
  organismName: string;
  submissionDataTypes?: {
    consensusSequences?: boolean;
    maxSequencesPerEntry?: number;
    files?: any;
  };
  loadSequencesAutomatically?: boolean;
  earliestReleaseDate?: {
    enabled: boolean;
    externalFields?: string[];
  };
  richFastaHeaderFields?: string[];
  files?: Array<{ name: string; [key: string]: any }>;
  metadata: MetadataField[];
  metadataAdd?: MetadataField[];
  metadataTemplate?: any;
  linkOuts?: Array<{ name: string; url: string; maxNumberOfRecommendedEntries?: number }>;
  image?: string;
  description?: string;
  website?: any;
  extraInputFields?: Array<any>;
  [key: string]: any;
}

export interface PreprocessingConfig {
  version: number | number[];
  image: string;
  args?: string[];
  configFile?: any;
  dockerTag?: string;
  replicas?: number;
  [key: string]: any;
}

export interface IngestConfig {
  image: string;
  configFile?: any;
  [key: string]: any;
}

export interface OrganismConfig {
  enabled?: boolean;
  schema: OrganismSchema;
  referenceGenomes: ReferenceGenomeSegment[];
  preprocessing: PreprocessingConfig[];
  ingest?: IngestConfig;
  enaDeposition?: any;
  [key: string]: any;
}

export interface S3Config {
  enabled: boolean;
  bucket: {
    endpoint?: string;
    region?: string;
    bucket: string;
    accessKey?: string;
    secretKey?: string;
  };
}

export interface ImageConfig {
  repository: string;
  tag?: string;
  pullPolicy?: string;
}

export interface LoculusValues {
  releaseNamespace: string;
  environment: string;
  imagePullPolicy: string;
  localHost: string;
  host?: string;
  subdomainSeparator?: string;
  robotsNoindexHeader?: boolean;
  enforceHTTPS?: boolean;
  insecureCookies?: boolean;

  seqSets: {
    enabled: boolean;
    crossRef?: any;
    fieldsToDisplay?: any[];
  };

  disableWebsite: boolean;
  disableBackend: boolean;
  disablePreprocessing: boolean;
  disableIngest: boolean;
  disableEnaSubmission: boolean;

  website: {
    websiteConfig: {
      enableLoginNavigationItem: boolean;
      enableSubmissionNavigationItem: boolean;
      enableSubmissionPages: boolean;
    };
  };

  siloImport: {
    siloTimeoutSeconds: number;
    hardRefreshIntervalSeconds: number;
    pollIntervalSeconds: number;
  };

  ingestLimitSeconds: number;
  getSubmissionListLimitSeconds: number;
  preprocessingTimeout: number;
  accessionPrefix: string;
  zstdCompressionLevel: number;
  pipelineVersionUpgradeCheckIntervalSeconds: number;

  dataUseTerms: {
    enabled: boolean;
    urls?: {
      open?: string;
      restricted?: string;
    };
  };

  fileSharing?: any;
  s3: S3Config;

  name: string;
  logo: { url: string; width: number; height: number };
  lineageSystemDefinitions?: Record<string, Record<number, string>>;

  organisms?: Record<string, OrganismConfig>;
  defaultOrganisms?: Record<string, OrganismConfig>;

  runDevelopmentMainDatabase?: boolean;
  runDevelopmentKeycloakDatabase?: boolean;
  runDevelopmentS3?: boolean;
  developmentDatabasePersistence?: boolean;

  auth: {
    verifyEmail: boolean;
    resetPasswordAllowed: boolean;
    registrationAllowed: boolean;
    smtp?: {
      host: string;
      port: string;
      from: string;
      replyTo: string;
      envelopeFrom: string;
      user: string;
    };
    identityProviders?: Record<string, any>;
  };

  createTestAccounts?: boolean;
  registrationTermsMessage?: string;

  images: {
    backend: ImageConfig;
    website: ImageConfig;
    loculusSilo: ImageConfig & { pullPolicy: string };
    lapis: ImageConfig & { tag: string };
    [key: string]: any;
  };

  replicas: {
    backend: number;
    website: number;
    lapis?: number;
    [key: string]: any;
  };

  resources?: Record<string, any>;
  defaultResources?: any;
  podPriorityClassName?: string;

  secrets?: Record<string, any>;

  silo?: {
    apiThreadsForHttpConnections?: number;
  };

  backendExtraArgs?: string[];

  branch?: string;
  sha?: string;
  testconfig?: boolean;
  usePublicRuntimeConfigAsServerSide?: boolean;

  previewDocs?: boolean;
  docsImage?: string;

  gitHubMainUrl?: string;
  bannerMessageURL?: string;
  bannerMessage?: string;
  submissionBannerMessageURL?: string;
  submissionBannerMessage?: string;
  gitHubEditLink?: string;
  welcomeMessageHTML?: string;
  additionalHeadHTML?: string;
  sequenceFlagging?: any;

  enaDeposition?: {
    submitToEnaProduction?: boolean;
    enaDbName?: string;
    enaUniqueSuffix?: string;
    enaIsBroker?: boolean;
    enaApprovedListTestUrl?: string;
    enaSuppressedListTestUrl?: string;
  };

  ingest?: {
    ncbiGatewayUrl?: string;
    mirrorBucket?: string;
  };

  [key: string]: any;
}

export interface EnabledOrganism {
  key: string;
  contents: OrganismConfig;
}

/**
 * Load and merge values from multiple YAML files plus --set overrides.
 */
export function loadValues(args: {
  valuesFiles: string[];
  sets: Record<string, string>;
  baseDir?: string;
}): LoculusValues {
  const baseDir = args.baseDir || path.resolve(__dirname, '../../loculus');

  // Start with defaults from values.yaml
  const defaultValuesPath = path.join(baseDir, 'values.yaml');
  let merged: any = {};
  if (fs.existsSync(defaultValuesPath)) {
    merged = yaml.load(fs.readFileSync(defaultValuesPath, 'utf8')) as any;
  }

  // Merge additional values files
  for (const f of args.valuesFiles) {
    const filePath = path.isAbsolute(f) ? f : path.resolve(process.cwd(), f);
    const extra = yaml.load(fs.readFileSync(filePath, 'utf8')) as any;
    merged = deepMerge(merged, extra);
  }

  // Apply --set overrides (supports dot-notation paths)
  for (const [key, value] of Object.entries(args.sets)) {
    setNestedValue(merged, key, parseSetValue(value));
  }

  return merged as LoculusValues;
}

function parseSetValue(value: string): any {
  if (value === 'true') return true;
  if (value === 'false') return false;
  const num = Number(value);
  if (!isNaN(num) && value !== '') return num;
  return value;
}

function setNestedValue(obj: any, path: string, value: any): void {
  const parts = path.split('.');
  let current = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    if (!(parts[i] in current) || typeof current[parts[i]] !== 'object') {
      current[parts[i]] = {};
    }
    current = current[parts[i]];
  }
  current[parts[parts.length - 1]] = value;
}

export function deepMerge(target: any, source: any): any {
  if (source === undefined || source === null) return target;
  if (typeof source !== 'object' || Array.isArray(source)) return source;
  const result = { ...target };
  for (const key of Object.keys(source)) {
    if (
      key in result &&
      typeof result[key] === 'object' &&
      !Array.isArray(result[key]) &&
      typeof source[key] === 'object' &&
      !Array.isArray(source[key])
    ) {
      result[key] = deepMerge(result[key], source[key]);
    } else {
      result[key] = source[key];
    }
  }
  return result;
}
