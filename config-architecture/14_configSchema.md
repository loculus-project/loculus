# 14. Config Schema (JSONB shapes)

Detail companion to [section 8](08_crosscuttingConcepts.md). Describes the JSONB stored in `config_instance_versions.config`, `config_organism_versions.config`, and the draft tables.

The **source of truth** is the canonical Zod schema in `config-tools/src/schema/canonicalConfig.ts` (re-exported by the website) and its Kotlin counterpart in `backend/.../config/Config.kt` + `InstanceConfig.kt`. The two are kept in sync by hand ([ADR-014](09_architecturalDecisions.md)); widen the Kotlin side first. This document summarises the shapes — when in doubt, the code wins.

Design principles:

- **Domain vocabulary**, not tool vocabulary. Translation to SILO/LAPIS happens in the adapter.
- **Self-contained snapshots.** Reference genomes are inlined; lineage definitions are referenced by URL from the instance config and resolved by the adapter at render time.
- **Stable identifiers.** `metadata[].name`, `inputFields[].name`, `linkOuts[].name` never change; display strings are freely editable.

Notation: TypeScript-ish; `?` = optional/nullable. Wire format is JSON.

## Instance config

```ts
type InstanceConfig = {
  name: string;                       // "Loculus"
  accessionPrefix: string;            // "LOC_" — effectively immutable (no operation edits it)
  dataUseTerms: {
    enabled: boolean;
    urls: { open: string; restricted: string } | null;
  };
  fileSharing: { outputFileUrlType: 'website' | 'backend' | 's3' };   // default 'website'

  // Branding / public text (all optional)
  description?: string | null;
  logo?: { url: string; alt?: string; width?: number; height?: number } | null;
  supportContact?: { email?: string; url?: string } | null;
  bannerMessage?: string | null;          bannerMessageURL?: string | null;
  submissionBannerMessage?: string | null; submissionBannerMessageURL?: string | null;
  welcomeMessageHTML?: string | null;     additionalHeadHTML?: string | null;
  gitHubMainUrl?: string | null;          gitHubEditLink?: string | null;
  gitHubIssuesUrl?: string | null;        issuesEmail?: string | null;
  dataUseTermsAgreementHTML?: string | null;

  // Feature toggles (flat booleans — there is no `featureFlags` object)
  enableSeqSets: boolean;                       // default false
  enableLoginNavigationItem: boolean;           // default true
  enableSubmissionNavigationItem: boolean;      // default true
  enableSubmissionPages: boolean;               // default true

  // Display defaults
  dateFieldForGroupGraph?: string | null;       // metadata field for the group-activity chart
  seqSetsFieldsToDisplay?: Array<{ field: string; displayName: string }> | null;
  seqSetsGraphs?: Array<{ name: string; displayName: string; type: 'date' | 'category'; fields: string[] }> | null;
  sequenceFlagging?: { github: { organization: string; repository: string; issueTemplate?: string } } | null;

  // Lineage system → pipeline version → definition-file URL. The adapter/silo-importer resolve these.
  lineageSystemDefinitions?: Record<string, Record<string, string>> | null;
};
```

The public read endpoint wraps it: `{ version, publishedAt, config: InstanceConfig, readOnlyMode }`. `readOnlyMode` comes from technical config, not the stored document.

## Preprocessing config files (separate, opaque, unversioned)

Distinct from the versioned config documents above: an admin may attach an opaque **config file** (free-form text) per `(organism, pipeline version)`. It is stored verbatim in `config_preprocessing_files` ([section 13](13_databaseSchema.md)), is *not* versioned, and the backend never parses it. External preprocessing pipelines fetch it themselves; the core stays pipeline-agnostic.

- Public read: `GET /api/config/organisms/{key}/preprocessing/{pipelineVersion}` → `text/plain` (404 if none); `GET /api/config/organisms/{key}/preprocessing` → list of configured versions.
- Admin write (`loculus_administrator`): `PUT`/`DELETE /api/admin/config/organisms/{key}/preprocessing/{pipelineVersion}` (direct save — no draft/publish).

Rationale is in [ADR-019/020](09_architecturalDecisions.md).

## Organism config

```ts
type OrganismConfig = {
  schema: Schema;
  referenceGenome: ReferenceGenome;            // simple, always present
  displayName?: string | null;                 // canonical organism display name (ADR-016)
  description?: string | null;
  image?: { url: string } | null;
  referenceGenomes?: ReferenceGenomeSegment[] | null;  // rich multi-segment / multi-reference shape
};
```

There is **no** top-level `organismName` (removed — see [ADR-016](09_architecturalDecisions.md)) and **no** `key` inside the JSON (the key is the `config_organisms.key` row identifier; the organism read response carries it as a sibling of `config`).

```ts
type Schema = {
  organismName: string;                 // LEGACY required name; consumers prefer OrganismConfig.displayName (ADR-016)
  image?: string | null;
  metadata: MetadataField[];
  externalMetadata: ExternalMetadata[];        // default []
  inputFields: InputField[];                   // default []
  tableColumns: string[];                      // default []; names must exist in metadata
  primaryKey?: string | null;                  // typically accessionVersion
  defaultOrderBy?: string | null;
  defaultOrder?: 'ascending' | 'descending' | null;
  metadataTemplate?: string[] | null;          // references inputFields[].name
  earliestReleaseDate?: { enabled: boolean; externalFields: string[] };   // default { false, [] }
  submissionDataTypes?: {
    consensusSequences: boolean;               // default true
    maxSequencesPerEntry?: number | null;
    files?: { enabled: boolean; categories: FileCategory[] } | null;
  };
  files: FileCategory[];                        // default []; allowed output-file categories
  loadSequencesAutomatically?: boolean | null;
  richFastaHeaderFields?: string[] | null;
  linkOuts: LinkOut[];                          // default []
  referenceIdentifierField?: string | null;
  multiFieldSearches?: MultiFieldSearch[] | null;
};
```

## Sub-types

```ts
type MetadataField = {
  name: string;                         // canonical identifier; never renamed via the API
  type: 'string' | 'date' | 'int' | 'float' | 'number' | 'timestamp' | 'boolean' | 'authors';
  required?: boolean;

  // Display
  displayName?: string; description?: string; definition?: string; header?: string;
  hidden?: boolean; initiallyVisible?: boolean; hideInSearchResultsTable?: boolean;
  hideOnSequenceDetailsPage?: boolean; includeInDownloadsByDefault?: boolean;
  columnWidth?: number; order?: number; orderOnDetailsPage?: number; orderInSearchDisplay?: number;
  percentage?: boolean; customDisplay?: Record<string, unknown>;

  // Search / query hints
  autocomplete?: boolean; notSearchable?: boolean; substringSearch?: boolean;
  rangeSearch?: boolean;
  rangeOverlapSearch?: { rangeName: string; rangeDisplayName: string; bound: 'lower' | 'upper' };
  lineageSearch?: boolean; isSequenceFilter?: boolean; noInput?: boolean;
  onlyForReference?: string; relatesToSegment?: string;

  // Adapter-facing (drive SILO rendering)
  perSegment?: boolean;                 // expanded per segment for multi-segment organisms
  lineageSystem?: string;               // references a key in InstanceConfig.lineageSystemDefinitions
  generateIndex?: boolean; oneHeader?: boolean;
  options?: Array<{ name: string }>; ingest?: string; ontology_id?: string;
};

type ExternalMetadata = { externalMetadataUpdater: string; name: string; type: MetadataField['type']; required?: boolean };

type InputField = {
  name: string;
  displayName?: string; definition?: string; guidance?: string;
  example?: string | number; required?: boolean; desired?: boolean; noEdit?: boolean;
  options?: Array<{ name: string }>;
};

type MultiFieldSearch = { name: string; displayName: string; fields: string[]; orderInSearchDisplay?: number };

type LinkOut = {
  name: string;                         // stable identifier; operations target by name
  url: string;                          // template, e.g. "https://example.com/?acc={accession}"
  category?: string;
  maxNumberOfRecommendedEntries?: number;       // positive int
  onlyForReferences?: Record<string, string>;
};

type FileCategory = { name: string; displayName?: string };

type ReferenceGenome = {
  nucleotideSequences: Array<{ name: string; sequence: string }>;   // 'main', or 'L'/'M'/'S'
  genes: Array<{ name: string; sequence: string }>;
};

type ReferenceGenomeSegment = {
  name: string; displayName?: string;
  references: Array<{
    name: string; displayName?: string; sequence: string;
    insdcAccessionFull?: string; genes?: Array<{ name: string; sequence: string }>;
  }>;
};
```

## Common (system) metadata

The fields every Loculus organism needs — `accessionVersion`, `accession`, `version`, `submissionId`, `isRevocation`, `submitter`, `groupName`, `groupId`, `submittedAtTimestamp`, `submittedDate`, `releasedAtTimestamp`, `releasedDate`, `versionStatus`, `versionComment`, `pipelineVersion`, and the data-use-terms fields when enabled — are **not** stored per organism. They are defined once in code (`config-tools/src/adapter/commonMetadata.ts`, driven by the instance config) and **composed onto** each organism's `metadata` at render time, by both the website transform and the adapter. Fixtures and admin forms therefore contain only organism-specific fields.

## What is intentionally not here

- Backend/Keycloak/LAPIS URLs, DB connection strings, ports, ingress, image tags, replica counts, resource limits — Helm/Spring only.
- Backend operational tuning (compression level, pipeline polling, read-only mode) — Spring/Helm technical config.
- The list of organisms — derived from `config_organisms` rows, not part of any config JSON.
- **Preprocessing pipeline config** — pipelines are external/customizable, so their config is *not* in the core config document. Per-field processing directives (the old `metadata[].preprocessing`) were removed. Instead an admin may attach an opaque, unversioned **config file** per `(organism, pipeline version)`, stored in `config_preprocessing_files` and served raw from a dedicated endpoint (below). The backend never interprets it. See [ADR-019/020](09_architecturalDecisions.md) and [section 13](13_databaseSchema.md).
- Ingest and ENA-deposition pipeline config — out of scope.
- Any credential or secret — those live in Helm as Kubernetes Secrets ([ADR-011](09_architecturalDecisions.md)).

## Adapter consumption (SILO, illustrative)

| Loculus field | SILO output |
|---|---|
| `metadata[].name` / `type` | `database_config.yaml: metadata[]` (with `timestamp→int`, `authors→string` translation) |
| `metadata[].generateIndex: true` | SILO `generateIndex: true` |
| `metadata[].lineageSystem` | SILO `generateIndex: true` + `generateLineageIndex: <system>`; lineage file referenced |
| `metadata[].perSegment: true` | expanded to `name_<segment>` per sorted segment |
| `referenceGenome` / `referenceGenomes` | flattened into `reference_genomes.json` |
| `schema.organismName` | `database_config.yaml: schema.instanceName` (legacy — would move to `displayName`) |
| `lineageSystemDefinitions` (instance) | downloaded and written as `lineage_<system>.yaml`, referenced by SILO |

These mappings live in `config-tools/src/adapter/` and evolve with SILO; no backend change is needed when they do.

## Validation status

The Kotlin and Zod representations validate **structure** on every draft mutation (deserialization + Zod parse). Cross-field invariants — `tableColumns` ⊆ `metadata` names, `defaultOrderBy`/`primaryKey` exist, `metadataTemplate` ⊆ `inputFields`, `multiFieldSearches[].fields` exist, file categories reference `schema.files` — are **not yet enforced server-side** on a full-document PUT (individual operation handlers do check their own preconditions). A canonical validator that runs on every mutation and returns `422` is the intended fix; see [section 11](11_risksAndTechnicalDebt.md).
