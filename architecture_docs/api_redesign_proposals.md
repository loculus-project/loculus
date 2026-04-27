# API Redesign Proposals

This document inventories every HTTP endpoint currently exposed by the Loculus
backend and proposes two alternative API structures: an **RPC-style** design
and a **REST-style** design. The goal is to compare both shapes against the
status quo so that a future redesign can be discussed concretely.

The current API mixes both styles — some routes are resource-shaped
(`/groups/{id}`, `/data-use-terms/{accession}`), while others are
verb-shaped (`/{organism}/submit`, `/{organism}/approve-processed-data`,
`/create-seqset`). The two proposals below pick a single style and apply it
consistently.

---

## 1. Current endpoint inventory

### 1.1 InfoController (public)

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/` (HTML) | Welcome page linking to Swagger UI |
| GET | `/` (JSON) | Backend info (name, status, debug flag) |

### 1.2 DataUseTermsController

| Method | Path | Purpose |
| --- | --- | --- |
| PUT | `/data-use-terms` | Change data-use terms for given accessions (only loosening allowed) |
| GET | `/data-use-terms/{accession}` | Get data-use-terms history for an accession |

### 1.3 FilesController

| Method | Path | Purpose |
| --- | --- | --- |
| GET/HEAD | `/files/get/{accession}/{version}/{fileCategory}/{fileName}` | 307 redirect to S3 pre-signed URL |
| POST | `/files/request-upload` | Request S3 pre-signed PUT URLs |
| POST | `/files/request-multipart-upload` | Request multipart upload URLs |
| POST | `/files/complete-multipart-upload` | Complete a multipart upload |

### 1.4 SubmissionController (per-organism)

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/{organism}/submit` | Submit new sequences (multipart) |
| POST | `/{organism}/revise` | Submit revisions to existing sequences |
| POST | `/{organism}/extract-unprocessed-data` | Stream unprocessed entries to the preprocessing pipeline |
| POST | `/{organism}/submit-processed-data` | Pipeline submits processed entries (NDJSON) |
| POST | `/{organism}/submit-external-metadata` | External pipeline updates metadata (NDJSON) |
| GET | `/{organism}/get-released-data` | Stream all released data (NDJSON, ETag) |
| GET | `/{organism}/get-data-to-edit/{accession}/{version}` | Fetch a version for editing |
| POST | `/{organism}/submit-edited-data` | Submit edited version |
| GET | `/{organism}/get-sequences` | List sequences for the user with filters |
| GET | `/{organism}/get-unprocessed-metadata` | Stream unprocessed metadata |
| POST | `/{organism}/approve-processed-data` | Approve processed entries for release |
| POST | `/{organism}/revoke` | Revoke released entries |
| DELETE | `/{organism}/delete-sequence-entry-versions` | Delete entry versions |

### 1.5 GroupManagementController

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/groups` | Create a group |
| PUT | `/groups/{groupId}` | Edit a group |
| GET | `/groups/{groupId}` | Get a group |
| GET | `/groups` | List all groups (filter by name) |
| GET | `/user/groups` | List groups the caller is a member of |
| PUT | `/groups/{groupId}/users/{username}` | Add user to group |
| DELETE | `/groups/{groupId}/users/{username}` | Remove user from group |

### 1.6 AdminDashboardController

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/admin/pipeline-statistics` | Counts by organism × pipeline version |
| GET | `/admin/current-pipeline-versions` | Current pipeline version per organism |

### 1.7 DebugController (debug mode only)

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/debug/delete-all-sequence-data` | Wipe all sequence data |

### 1.8 SeqSetCitationsController (feature-flagged)

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/get-seqset` | Get a SeqSet by id (and optional version) |
| POST | `/validate-seqset-records` | Validate SeqSet records |
| POST | `/create-seqset` | Create a SeqSet |
| PUT | `/update-seqset` | Update a SeqSet |
| GET | `/get-seqsets-of-user` | List caller's SeqSets |
| GET | `/get-seqset-records` | Records in a SeqSet |
| DELETE | `/delete-seqset` | Delete a SeqSet |
| POST | `/create-seqset-doi` | Mint DOI for a SeqSet version |
| GET | `/get-user-cited-by-seqset` | Citation count for caller's sequences |
| GET | `/get-seqset-cited-by-publication` | Publication-citation count for a SeqSet |
| GET | `/get-author` | Author profile by username |

### Pain points observed in the current API

- **Mixed verb/resource style.** `/{organism}/get-sequences` next to `/groups/{id}` is hard to reason about.
- **Action verbs as paths** (`approve-processed-data`, `submit-edited-data`, `delete-sequence-entry-versions`) don't compose with HTTP semantics.
- **`organism` as a top-level segment** rather than a query/scope is unique to submission endpoints — files, groups, SeqSets and data-use-terms ignore it even though many of those resources are organism-scoped in practice.
- **Streaming and bulk operations** (NDJSON, ETag, ZSTD) are mixed in among ordinary CRUD without a naming convention.
- **SeqSets** uses a third style (`get-*`, `create-*`, `update-*` as flat root paths).
- **Path shape `/files/get/...`** has a redundant `get` segment.

Both proposals below address these.

---

## 2. RPC-style proposal

### Design principles

- One verb-named procedure per logical operation. URLs read like function names.
- All calls are `POST` with a JSON body, except a small number of GETs that exist purely for browser-cacheable downloads (released data, file blobs).
- Methods are grouped under flat namespaces: `/rpc/{namespace}.{method}`.
- Streaming methods are explicitly suffixed (`.stream`) and return NDJSON.
- The organism is **always a parameter in the request body**, never in the path. Files and groups carry it the same way as submission.
- Errors follow a single envelope: `{ "error": { "code": "NOT_FOUND", "message": "...", "details": {...} } }`.
- Every call accepts an optional `idempotencyKey` for safe retries on mutations.

### Namespace overview

```
/rpc/info.*
/rpc/sequences.*
/rpc/pipeline.*
/rpc/files.*
/rpc/groups.*
/rpc/dataUseTerms.*
/rpc/seqSets.*
/rpc/admin.*
/rpc/debug.*
```

### Endpoints

#### `info`

| Method | Path | Body | Returns |
| --- | --- | --- | --- |
| GET | `/rpc/info.get` | — | `{ name, status, documentation, isInDebugMode }` |

#### `sequences` (replaces SubmissionController)

| Method | Path | Body | Returns |
| --- | --- | --- | --- |
| POST | `/rpc/sequences.submit` | multipart: `metadataFile`, `sequenceFile?`, JSON part `{ organism, groupId, dataUseTermsType?, restrictedUntil?, fileMapping? }` | `SubmissionIdMapping[]` |
| POST | `/rpc/sequences.revise` | multipart equivalent of submit | `SubmissionIdMapping[]` |
| POST | `/rpc/sequences.list` | `{ organism, groupIdsFilter?, statusesFilter?, processingResultFilter?, page?, size? }` | `GetSequenceResponse` |
| POST | `/rpc/sequences.getForEdit` | `{ organism, accession, version }` | `SequenceEntryVersionToEdit` |
| POST | `/rpc/sequences.submitEdit` | `{ organism, edited: EditedSequenceEntryData }` | `void` |
| POST | `/rpc/sequences.approve` | `{ organism, scope: AccessionVersionsFilterWithApprovalScope }` | `AccessionVersion[]` |
| POST | `/rpc/sequences.revoke` | `{ organism, accessions, comment }` | `SubmissionIdMapping[]` |
| POST | `/rpc/sequences.delete` | `{ organism, scope: AccessionVersionsFilterWithDeletionScope }` | `AccessionVersion[]` |
| GET | `/rpc/sequences.released.stream` | query `{ organism, compression? }`, `If-None-Match` header | NDJSON stream + ETag, `X-Total-Records` |
| POST | `/rpc/sequences.unprocessedMetadata.stream` | `{ organism, fields?, groupIdsFilter?, statusesFilter?, compression? }` | NDJSON stream |

The two streaming endpoints keep `GET`/`POST` semantics from the current
implementation: released data is conditionally cacheable (GET + ETag),
unprocessed metadata is parameterised (POST).

#### `pipeline` (preprocessing-only methods, separated from `sequences`)

| Method | Path | Body | Returns |
| --- | --- | --- | --- |
| POST | `/rpc/pipeline.extract.stream` | `{ organism, numberOfSequenceEntries, pipelineVersion }`, `If-None-Match` | NDJSON of `UnprocessedData` |
| POST | `/rpc/pipeline.submitProcessed` | NDJSON of `SubmittedProcessedData`, query `{ organism }` | `void` |
| POST | `/rpc/pipeline.submitExternalMetadata` | NDJSON of `ExternalSubmittedData`, query `{ organism }` | `void` |

Splitting these out is the single biggest readability win of the RPC proposal:
it makes obvious which calls are for end-user clients and which are for the
internal preprocessing pipeline.

#### `files`

| Method | Path | Body | Returns |
| --- | --- | --- | --- |
| POST | `/rpc/files.requestUpload` | `{ groupId, numberFiles }` | `FileIdAndWriteUrl[]` |
| POST | `/rpc/files.requestMultipartUpload` | `{ groupId, numberFiles, numberParts }` | `FileIdAndMultipartWriteUrl[]` |
| POST | `/rpc/files.completeMultipartUpload` | `FileIdAndEtags[]` | `void` |
| GET | `/rpc/files.download` | query `{ accession, version, category, name }` | 307 redirect to S3 |

#### `groups`

| Method | Path | Body | Returns |
| --- | --- | --- | --- |
| POST | `/rpc/groups.create` | `NewGroup` | `Group` |
| POST | `/rpc/groups.update` | `{ groupId, ...NewGroup }` | `Group` |
| POST | `/rpc/groups.get` | `{ groupId }` | `GroupDetails` |
| POST | `/rpc/groups.list` | `{ name? }` | `Group[]` |
| POST | `/rpc/groups.listMine` | — | `Group[]` |
| POST | `/rpc/groups.addMember` | `{ groupId, username }` | `void` |
| POST | `/rpc/groups.removeMember` | `{ groupId, username }` | `void` |

#### `dataUseTerms`

| Method | Path | Body | Returns |
| --- | --- | --- | --- |
| POST | `/rpc/dataUseTerms.set` | `{ accessions, newDataUseTerms }` | `void` |
| POST | `/rpc/dataUseTerms.history` | `{ accession }` | `DataUseTermsHistoryEntry[]` |

#### `seqSets`

| Method | Path | Body | Returns |
| --- | --- | --- | --- |
| POST | `/rpc/seqSets.get` | `{ seqSetId, version? }` | `SeqSet[]` |
| POST | `/rpc/seqSets.records` | `{ seqSetId, version? }` | `SeqSetRecord[]` |
| POST | `/rpc/seqSets.validate` | `SubmittedSeqSetRecord[]` | validation result |
| POST | `/rpc/seqSets.create` | `SubmittedSeqSet` | `ResponseSeqSet` |
| POST | `/rpc/seqSets.update` | `SubmittedSeqSetUpdate` | `ResponseSeqSet` |
| POST | `/rpc/seqSets.delete` | `{ seqSetId, version }` | `void` |
| POST | `/rpc/seqSets.mintDoi` | `{ seqSetId, version }` | `ResponseSeqSet` |
| POST | `/rpc/seqSets.listMine` | — | `SeqSet[]` |
| POST | `/rpc/seqSets.citedByForUser` | — | `CitedBy` |
| POST | `/rpc/seqSets.citedByPublication` | `{ seqSetId, version }` | `CitedBy` |
| POST | `/rpc/authors.get` | `{ username }` | `AuthorProfile` |

#### `admin` / `debug`

| Method | Path | Body | Returns |
| --- | --- | --- | --- |
| GET | `/rpc/admin.pipelineStatistics` | — | `Map<organism, Map<version, count>>` |
| GET | `/rpc/admin.currentPipelineVersions` | — | `Map<organism, version>` |
| POST | `/rpc/debug.deleteAllSequenceData` | — | `void` (only when `DEBUG_MODE`) |

### When the RPC style is the better choice

- Most call sites are typed clients (Kotlin, TypeScript) generated from an
  OpenAPI/Smithy spec — clients see `client.sequences.approve(...)` regardless
  of HTTP shape.
- Many of the existing operations are inherently "do an action" (approve,
  revoke, mint DOI, request pre-signed URL) that don't map cleanly onto a
  single resource.
- Streaming endpoints with NDJSON and ETag don't fit standard REST semantics
  anyway, and the `.stream` suffix makes that explicit.

---

## 3. REST-style proposal

### Design principles

- Resources are nouns; HTTP methods carry the verb.
- `POST` creates, `GET` reads, `PATCH` partial-updates, `PUT` full-updates,
  `DELETE` deletes.
- Plural collection paths, with sub-resources for relationships.
- The organism is a first-class scope: most sequence-shaped resources live
  under `/v1/organisms/{organism}/...`. Globals (groups, users, files, info)
  live at the root.
- Versioned: everything mounts under `/v1/`.
- Filter/page/sort use query strings, never path parameters.
- Action-shaped operations that genuinely don't fit CRUD (approve, revoke,
  DOI mint) use a clearly delimited sub-path of the form `:action`
  (Google AIP-136 style), so they can't be confused with resources.
- Streaming endpoints negotiate via `Accept: application/x-ndjson` and use
  `Range`/`ETag` semantics.
- Errors use [RFC 9457 Problem Details](https://www.rfc-editor.org/rfc/rfc9457).

### Resource map

```
/v1/info
/v1/organisms/{organism}/sequences
/v1/organisms/{organism}/sequences/{accession}
/v1/organisms/{organism}/sequences/{accession}/versions
/v1/organisms/{organism}/sequences/{accession}/versions/{version}
/v1/organisms/{organism}/sequences/{accession}/versions/{version}/files/{category}/{name}
/v1/organisms/{organism}/sequences/{accession}/data-use-terms
/v1/organisms/{organism}/released-data
/v1/organisms/{organism}/preprocessing/jobs
/v1/organisms/{organism}/preprocessing/results
/v1/groups
/v1/groups/{groupId}
/v1/groups/{groupId}/members
/v1/groups/{groupId}/members/{username}
/v1/users/me
/v1/users/me/groups
/v1/files/uploads
/v1/files/uploads/{uploadId}
/v1/seq-sets
/v1/seq-sets/{seqSetId}/versions/{version}
/v1/seq-sets/{seqSetId}/versions/{version}/records
/v1/seq-sets/{seqSetId}/versions/{version}/doi
/v1/authors/{username}
/v1/admin/pipeline-versions
/v1/admin/pipeline-statistics
```

### Endpoints

#### Info

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/v1/info` | Backend info (JSON). Browser/HTML stays at `/`. |

#### Sequences

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/v1/organisms/{organism}/sequences` | List sequences (`?groupId=...&status=...&processingResult=...&page=...&size=...`) |
| POST | `/v1/organisms/{organism}/sequences` | Submit new sequences (multipart). Replaces `/submit` and `/revise` — revision detected by accession presence in metadata, or via header `X-Submission-Mode: revise` |
| GET | `/v1/organisms/{organism}/sequences/{accession}` | Latest version of a sequence |
| GET | `/v1/organisms/{organism}/sequences/{accession}/versions` | All versions of a sequence |
| GET | `/v1/organisms/{organism}/sequences/{accession}/versions/{version}` | Specific version (read-only) |
| GET | `/v1/organisms/{organism}/sequences/{accession}/versions/{version}/edit` | Editable representation (was `/get-data-to-edit`). The `/edit` sub-resource exposes the editor view. |
| PUT | `/v1/organisms/{organism}/sequences/{accession}/versions/{version}` | Submit edited version (was `/submit-edited-data`) |
| DELETE | `/v1/organisms/{organism}/sequences/{accession}/versions/{version}` | Delete a single version |
| DELETE | `/v1/organisms/{organism}/sequences` | Bulk delete by filter (body = scope JSON, content-type `application/merge-patch+json`) |
| POST | `/v1/organisms/{organism}/sequences:approve` | Approve scoped versions (action) |
| POST | `/v1/organisms/{organism}/sequences:revoke` | Revoke (action) |

#### Released data (read-only public stream)

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/v1/organisms/{organism}/released-data` | Stream released sequences as NDJSON. Content-negotiated (`Accept: application/x-ndjson`), supports `If-None-Match`, `Accept-Encoding: zstd`. |

#### Preprocessing pipeline

Modelled as **jobs** (the work to do) and **results** (what comes back),
which gives the asynchronous loop a natural REST shape:

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/v1/organisms/{organism}/preprocessing/jobs` | Reserve and stream up to N unprocessed entries (was `/extract-unprocessed-data`). Returns NDJSON of jobs; idempotent via `If-None-Match`. |
| POST | `/v1/organisms/{organism}/preprocessing/results` | Submit processed data (NDJSON body). Was `/submit-processed-data`. |
| POST | `/v1/organisms/{organism}/preprocessing/external-metadata` | Submit external-pipeline metadata. Was `/submit-external-metadata`. |
| GET | `/v1/organisms/{organism}/preprocessing/unprocessed-metadata` | Stream unprocessed metadata (was `/get-unprocessed-metadata`) |

Calling these "jobs" and "results" makes the workflow much more discoverable
than two unrelated `extract-…` and `submit-…` verbs.

#### Data-use terms

Modelled as a sub-resource of a sequence:

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/v1/organisms/{organism}/sequences/{accession}/data-use-terms` | History of data-use terms |
| PATCH | `/v1/organisms/{organism}/sequences/{accession}/data-use-terms` | Single-accession change (server still enforces "only loosening allowed") |
| POST | `/v1/data-use-terms:bulk-update` | Multi-accession change (action; body has `accessions` and `newDataUseTerms`) |

#### Files

Files are uploaded as **uploads** (a resource you create, then close):

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/v1/files/uploads` | Create upload(s). Body: `{ groupId, count, multipart?, parts? }`. Returns ids + pre-signed URLs. Replaces both `/request-upload` and `/request-multipart-upload`. |
| POST | `/v1/files/uploads/{uploadId}:complete` | Complete a multipart upload (body: ETags) |
| GET | `/v1/organisms/{organism}/sequences/{accession}/versions/{version}/files/{category}/{name}` | 307 redirect to S3. Co-locates files with the version they belong to. |

#### Groups & users

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/v1/groups` | List groups (`?name=`) |
| POST | `/v1/groups` | Create a group |
| GET | `/v1/groups/{groupId}` | Get a group |
| PATCH | `/v1/groups/{groupId}` | Update a group |
| GET | `/v1/groups/{groupId}/members` | List members |
| PUT | `/v1/groups/{groupId}/members/{username}` | Add a member (idempotent) |
| DELETE | `/v1/groups/{groupId}/members/{username}` | Remove a member |
| GET | `/v1/users/me` | Authenticated user profile (new convenience) |
| GET | `/v1/users/me/groups` | Caller's groups (replaces `/user/groups`) |

#### SeqSets

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/v1/seq-sets` | List SeqSets (`?owner=me` for caller's; `?cited=true` etc.) |
| POST | `/v1/seq-sets` | Create a SeqSet |
| GET | `/v1/seq-sets/{seqSetId}` | Latest version |
| GET | `/v1/seq-sets/{seqSetId}/versions/{version}` | Specific version |
| PUT | `/v1/seq-sets/{seqSetId}/versions/{version}` | Update a version |
| DELETE | `/v1/seq-sets/{seqSetId}/versions/{version}` | Delete |
| GET | `/v1/seq-sets/{seqSetId}/versions/{version}/records` | Records |
| POST | `/v1/seq-sets:validate` | Validate records (action; doesn't create anything) |
| POST | `/v1/seq-sets/{seqSetId}/versions/{version}/doi` | Mint a DOI for the version |
| GET | `/v1/seq-sets/{seqSetId}/versions/{version}/citations` | Citation count by publication |
| GET | `/v1/users/me/citations` | Citations of caller's sequences |
| GET | `/v1/authors/{username}` | Author profile |

#### Admin & debug

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/v1/admin/pipeline-versions` | Current pipeline version per organism |
| GET | `/v1/admin/pipeline-statistics` | Counts per organism × version |
| DELETE | `/v1/debug/sequence-data` | Wipe data (only when `DEBUG_MODE`) |

### Conventions across all resources

- **Pagination:** `?page=` + `?size=`, with `Link` headers for `next`/`prev`.
- **Filtering:** repeated query params (`?status=APPROVED&status=REVOKED`).
- **Conditional reads:** `ETag` + `If-None-Match` (already used for released
  data; generalised here).
- **Idempotency:** `Idempotency-Key` header on all unsafe methods.
- **Streaming:** `Accept: application/x-ndjson` + optional
  `Accept-Encoding: zstd`. No more `compression=` query parameter.
- **Bulk actions** that don't fit CRUD use the AIP-136 `:action` suffix —
  visually distinct from resource paths so there's no ambiguity.
- **Versioning:** all paths prefixed with `/v1/`. Future incompatible changes
  ship as `/v2/`.

### When the REST style is the better choice

- The API is consumed by ad-hoc clients (curl, browsers, scripts) and benefits
  from cacheability and HTTP-native semantics.
- Resources have a clear lifecycle (sequences → versions → files; groups →
  members; SeqSets → versions → records → DOI). REST makes that hierarchy
  explicit in the URL.
- Tooling (OpenAPI, HAL, hypermedia clients, API gateways, CDN caching,
  per-route rate limits) keys off resource paths and HTTP methods.

---

## 4. Side-by-side comparison

| Concern | Current | RPC proposal | REST proposal |
| --- | --- | --- | --- |
| Naming consistency | Mixed | `namespace.method` everywhere | nouns + HTTP verbs everywhere |
| Organism scoping | Only on submission paths | Always in body | Always in path under `/v1/organisms/{organism}/` |
| Action-shaped ops (approve/revoke/DOI) | Plain paths | First-class procedures | `:action` suffix |
| Streaming endpoints | Implicit, ad hoc | `.stream` suffix, NDJSON body | Content negotiation, `Accept: application/x-ndjson` |
| Conditional caching | Two endpoints use ETag | Same | Generalised across reads |
| Versioning | None | None (procedure-level evolution) | `/v1/` prefix |
| Bulk vs single | Same endpoint | Same procedure with filter | Single is `/{id}`; bulk is `:action` or filter body |
| Discoverability | Swagger only | Swagger; `namespace.*` autocompletes well | Swagger + HATEOAS-ready |
| Client SDK fit | Awkward | Excellent (1:1 method mapping) | Good |
| HTTP gateway / CDN fit | Awkward | Poor (everything POST) | Excellent |

## 5. Recommendation

If Loculus stays primarily a backend talked to by generated clients (the
website and the preprocessing pipeline are the dominant consumers), the
**RPC-style** design is the smaller jump and the easiest to evolve — most of
the current pain is naming inconsistency, not HTTP semantics.

If Loculus wants the API to be a first-class public product (third-party
tools, browser caching of released data, gateway-managed rate limiting, and
hypermedia exploration), the **REST-style** design pays for itself: the
preprocessing-jobs/results model alone makes the system meaningfully easier
to explain.

A pragmatic middle path is to adopt the REST proposal's path conventions
(`/v1/organisms/{organism}/...`, `:action` for non-CRUD) but keep the existing
streaming endpoints unchanged during the transition.
