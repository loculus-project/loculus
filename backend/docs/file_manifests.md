# Plan: manifest-based bulk upload & revision of files (raw reads)

> Status: **design proposal** — captures the semi-consensus from the Zoom / Slack discussion on bulk
> upload and revision of raw reads. Not yet implemented. See the existing [file sharing](./file_sharing.md)
> doc for the machinery this builds on.

## 1. Motivation

Today, attaching files (e.g. raw reads) to a submission means either:

- **Website**: uploading a *folder* (one sub-folder per `submissionId`) via `FolderUploadComponent`, which
  uploads each file to S3 and builds the `fileMapping` JSON behind the scenes; or
- **API**: manually calling `/files/request-upload`, `PUT`-ing to the presigned URLs, and hand-crafting the
  `fileMapping` JSON
  (`{submissionId: {category: [{fileId, name}]}}` — see [`SubmissionControllerDescriptions.kt`](../src/main/kotlin/org/loculus/backend/controller/SubmissionControllerDescriptions.kt)).

Two things are missing:

1. A **first-class, tabular, human-authorable** way to declare which files belong to which entry, that
   works for bulk submission and — crucially — for **bulk revision**, where the user wants to keep most
   files unchanged, delete a few, and add a few.
2. **Round-tripping**: when you download your data to revise it, the file associations are *not* included
   today (`POST /get-submitted-data` emits only `metadata.tsv` + `sequences.fasta`). So there is no way to
   bulk-revise entries without re-declaring every file mapping by hand.

## 2. The decision: manifest file (not a metadata column)

Two shapes were discussed. They are near-equivalent; the manifest won the vote (6 vs 3) and is the
recommendation here. The metadata-column shape is retained below as a documented fallback because the
migration path between them is straightforward.

### 2a. Manifest (recommended)

A separate TSV, uploaded alongside `metadata.tsv` (+ optional `sequences.fasta`) and the files. One **row
per file**:

```
id          category    fileName                        fileId
sampleA     rawReads    SAG_123.fq
sampleA     rawReads    SAG_456.fq
sampleB     rawReads    big_bag_of_reads.fq             8723478-2145-4134-...
```

- `id` — the `submissionId` (submission) or `accession` (revision) that owns the file. Multiple rows share
  an `id` when an entry has multiple files. Matches the existing `id` / `submissionId` /`accession`
  conventions (`METADATA_ID_HEADER` in [`SubmitModel.kt`](../src/main/kotlin/org/loculus/backend/model/SubmitModel.kt)).
- `category` — the file category (must be one of `submissionDataTypes.files.categories`). **Optional/omittable
  when the organism configures exactly one submission category** (defaults to it), to keep the common case
  simple.
- `fileName` — the display name of the file. This becomes the cosmetic name stored in the `files` JSONB
  (the S3 key is always `files/{uuid}`; names are applied via `Content-Disposition` at download).
- `fileId` — **blank** ⇒ this is a *new* file to be uploaded (the client resolves the name against the
  uploaded file set and does the `request-upload` → `PUT` → attach dance). **A UUID** ⇒ reference an
  *existing* backend file by ID. Not present in the default template for first submissions (advanced use).

### 2b. Metadata column (fallback, not recommended now)

A single metadata column (e.g. `reads_filenames`) holding a space-separated list. At submission:
`SAG_123.fq SAG_456.fq`. After download-for-revision: `SAG_123.fq:<uuid> SAG_456.fq:<uuid>`. Edit the
string to add/remove/rename. This is strictly less expressive (no clean per-file category column, no room
for future per-file attributes) but is trivially convertible to/from the manifest, so choosing the manifest
now does not close the door.

### Relationship to the existing API

The manifest is, in essence, an **alternate serialization of the existing `SubmissionIdFilesMap`**
(`Map<SubmissionId, Map<FileCategory, List<{fileId, name}>>>`). Everything downstream of parsing —
validation, group-ownership checks, storage in the `submitted_data` JSONB, preprocessing hand-off — is
unchanged. This is what makes the feature low-risk and backwards-compatible.

## 3. Semantics

### 3a. `fileId` — new vs existing vs reuse

| `fileId` value      | Meaning                                                                                     |
| ------------------- | ------------------------------------------------------------------------------------------- |
| blank               | New file. Client uploads the local file named `fileName`, obtains a UUID, attaches it.       |
| an existing UUID    | Reference an already-uploaded backend file. No re-upload. Enables cross-entry reuse.         |

The backend remains the **sole** generator of file IDs (real UUIDs only). A user-supplied `fileId` is never
trusted blindly: it is validated exactly as today — it must exist, not be marked-for-deletion, have a real
uploaded object in S3, and be **owned by the submitting group** (`validateFileGroupOwnership` in
[`SubmitModel.kt`](../src/main/kotlin/org/loculus/backend/model/SubmitModel.kt)). This supports Chaoran's
"one big bag of reads referenced from both an RSV and a flu submission" use case, and lets external clients
pre-upload and generate a manifest.

### 3b. Rename

Because `fileId` is the identity and `fileName` is cosmetic, changing `fileName` while keeping the same
`fileId` on a revision **renames** the file with no re-upload. This falls out for free.

### 3c. Delete / add on revision

Starting from a downloaded manifest (§5):

- **Keep** a file: leave its row unchanged (`fileId` populated).
- **Delete** a file: remove its row.
- **Add** a file: add a row with a blank `fileId` and upload the corresponding file.
- **Rename**: edit `fileName`, keep `fileId`.

## 4. Filename uniqueness, folders, and final names (Chaoran's concern)

This is the one genuinely tricky area, and the plan must not regress existing instances.

**Current constraints (must be preserved):**
- In *processed* data, `fileName` is unique only within an `(entry, category)` — see
  `getDuplicateFileNames` and `validateFilenamesAreUnique`
  ([`FileMappingPreconditionValidator.kt`](../src/main/kotlin/org/loculus/backend/service/submission/FileMappingPreconditionValidator.kt)).
- Instances rely on this: the wastewater instance stores files always named `REF_aln_trim.bam`, identical
  across every entry. A "copy-over" pipeline just passes files through. **Final stored names must stay
  exactly `REF_aln_trim.bam`, never `submissionId/REF_aln_trim.bam`.**

**Why a naïve flat-folder bulk upload breaks this:** if all files for a submission live in one flat folder
and are matched to manifest rows by `fileName`, then `fileName` must be unique *across the whole folder* —
which forbids two entries both having `REF_aln_trim.bam`.

**Resolution — keep name-matching scoped per entry, not per folder:**

1. **Reuse the existing per-`submissionId` sub-folder convention** for bulk uploads (already implemented in
   `FolderUploadComponent`: `submissionId = file.webkitRelativePath.split('/')[1]`). The manifest's
   `(id, category, fileName)` tuple is resolved against *that entry's* sub-folder, so `fileName` only needs
   to be unique within `(entry, category)` — matching the processed-data rule. Same-named files across
   entries are fine.
2. **Final stored `fileName` is the leaf name only** (`REF_aln_trim.bam`), never path-prefixed. The
   sub-folder / any path is purely a client-side upload-organization device and is stripped before building
   the `fileMapping`.
3. Make the strictness **configurable per category** so instances that *want* a single flat folder with a
   global-uniqueness requirement can opt in (Theo: "wouldn't be against making this configurable per
   field-type"). Proposed knob, defaulting to the safe per-entry behavior:

   ```yaml
   submissionDataTypes:
     files:
       enabled: true
       categories:
         - name: rawReads
           # fileNameScope: perEntry   # default: names unique within (entry, category)
           #                global     # opt-in: names unique across the whole upload folder
   ```

4. **Sub-directories inside an entry's file set**: out of scope for v1 (disallow, as the folder uploader
   already does). If demand appears, an optional `finalPath` manifest column can be added later to let users
   control organization without changing the default leaf-name behavior.

## 5. Revision round-trip (the missing piece)

Bulk revision only works if downloading your data gives back a manifest you can edit.

**Backend gap:** `SubmissionController.getSubmittedData` / `GetSubmittedDataHelpers`
([`GetSubmittedDataHelpers.kt`](../src/main/kotlin/org/loculus/backend/utils/GetSubmittedDataHelpers.kt))
currently emit only `metadata.tsv` and `sequences.fasta`; they do **not** surface files. This must be
extended.

**Plan:** when an organism has file submission enabled, `POST /get-submitted-data` additionally streams a
`manifest.tsv` into the download zip, built from each entry's `submitted_data.files` JSONB:

```
id (=accession)   category    fileName            fileId
PP_003RTGP.1       rawReads    SAG_123.fq          8723478-2145-...
PP_003RTGP.1       rawReads    SAG_456.fq          1232235-666-...
```

Re-uploading this manifest unchanged re-attaches the same files (90% case). Editing it does delete / add /
rename per §3c.

**Safety rail (Theo):** if a user revises an accession that currently has files, but the re-submitted
manifest neither references the existing `fileId`s nor supplies replacement uploads for that category,
**reject the revision** rather than silently dropping all files. Bulk revisions are rare, so an explicit
"you're about to remove all files from N entries — confirm" gate (website) + a hard backend error when the
manifest is entirely absent for previously-filed entries is acceptable.

**Note on `fileId` vs accession identifiers (Anna's point):** Anna preferred exposing an
`accessionVersion` where a file was used rather than a raw UUID. The manifest's separate `fileId` column
keeps the UUID out of the user's way for the common "leave it alone" case while still being explicit. If we
later want to hide UUIDs entirely, the download could instead emit a `usedIn` accession reference and the
backend would resolve it back to a `fileId` — this is an additive change and does not block v1.

## 6. Where the manifest is parsed

Two viable places; recommend a phased approach.

- **Phase 1 — client-side (website only), backend API unchanged.** The website reads `manifest.tsv` + the
  uploaded folder, performs the uploads, and constructs the existing `fileMapping` JSON for `/submit` /
  `/revise`. Only the revision *download* needs backend work (§5). Lowest risk; ships the UX fastest.
- **Phase 2 — first-class backend param.** Add an optional `manifestFile` multipart part to `/submit` and
  `/revise` that the backend parses into a `SubmissionIdFilesMap` (mutually exclusive with, or overriding,
  the raw `fileMapping` JSON). This gives the CLI and third-party clients one canonical tabular format and
  keeps parsing logic in one place. The website can then switch to sending the manifest verbatim.

Note that file *bytes* are always uploaded to S3 first (unchanged); the manifest only ever carries
names/ids, never file content.

## 7. Configuration

Building on the existing config
([`Config.kt`](../src/main/kotlin/org/loculus/backend/config/Config.kt) — `FilesSubmissionDataType`,
`FileCategory`; website mirror in `website/src/types/config.ts`):

```yaml
my-organism:
  schema:
    submissionDataTypes:
      files:
        enabled: true
        # manifest: true            # (phase 2) accept manifest-based bulk upload for this organism
        categories:
          - name: rawReads
            displayName: Raw reads
            # fileNameScope: perEntry # see §4
```

Backend `FileCategory(name)` gains optional `fileNameScope` (and the website `fileCategory` zod schema the
matching field). If a genuinely new *metadata column type* is ever chosen instead of a manifest file, it
would have to be added to both `metadataPossibleTypes` (`website/src/types/config.ts`) and the backend
`MetadataType` enum (they are kept in sync) — another reason the standalone manifest file is cheaper.

## 8. Implementation checklist (by component)

**Backend**
- [ ] Extend `POST /get-submitted-data` to include `manifest.tsv` for file-enabled organisms (build from
      `submitted_data.files`). New helper in `GetSubmittedDataHelpers.kt`.
- [ ] (Phase 2) Accept a `manifestFile` multipart part on `/submit` & `/revise`; parse TSV →
      `SubmissionIdFilesMap`; reuse all existing validators
      (`SubmissionIdFilesMappingPreconditionValidator`).
- [ ] Revision safety rail: reject revisions that would silently drop all files from previously-filed
      entries (§5).
- [ ] `fileNameScope` config on `FileCategory`; enforce `global` vs `perEntry` uniqueness in
      `validateFilenamesAreUnique`.
- [ ] Tests: extend `SubmissionJourneyWithFilesTest`, `ReviseEndpointTest`, and the file-sharing endpoint
      tests; add a manifest round-trip test.

**Website**
- [ ] Bulk manifest UX in `DataUploadForm` / `FolderUploadComponent`: accept a `manifest.tsv` describing
      `(id, category, fileName, fileId)`; match rows to uploaded files per entry sub-folder; build
      `fileMapping`.
- [ ] Revision: download the new `manifest.tsv`, pre-fill, and diff on re-upload (keep/delete/add/rename).
- [ ] Confirmation gate when a revision removes all files from entries.
- [ ] Manifest template download alongside the existing metadata template
      (`SequenceEntryUploadComponent`, `routes.metadataTemplate`).
- [ ] Config schema: add `fileNameScope` to `fileCategory`.

**CLI** (`cli/` — currently has *no* file support)
- [ ] Add file upload + manifest generation to `submit`/`revise` so the CLI can drive the Phase-2 backend
      param (matches Theo's "write your own client that uploads files and generates a manifest").

**Docs / config**
- [ ] Update `docs/.../submit-extra-files.md` and `configuring-extra-files.md` with the manifest workflow.
- [ ] Example in `kubernetes/loculus/values.yaml` (`dummy-organism-with-files`) + Helm templates
      (`_submission-data-types.tpl`).

## 9. Open questions

1. **Per-file metadata columns.** Anna's example manifest carried `pairedRead` / `pairedInsertLength`
   columns. The current data model stores only `{fileId, name}` per file — no per-file attributes. Options:
   (a) keep such attributes in the main per-entry metadata (MVP); (b) extend the `files` JSONB to hold
   arbitrary per-file attributes (larger change). **Recommend (a) for v1**, revisit if paired-read insert
   length genuinely needs to live per-file.
2. **`category` column: required or inferable?** Default to the single configured category when there's
   exactly one; require the column otherwise. Confirm this is acceptable.
3. **Hide UUIDs entirely?** (Anna) Ship UUID `fileId` for v1; keep the door open to an accession-based
   reference in the download (§5).
4. **Folder vs files vs zip upload UX.** Keep the current folder picker (one sub-folder per `submissionId`)
   for bulk; a flat multi-file picker is only viable with `fileNameScope: global`. Zip was considered worse
   UX and is not planned.
5. **Phase 1 vs Phase 2 sequencing** — confirm shipping the website-only client-side manifest first, with
   the backend `manifestFile` param following.

## 10. Backwards compatibility

- The raw `fileMapping` JSON API path stays; nothing about existing submissions changes.
- The manifest is an additive serialization over `SubmissionIdFilesMap`; storage, preprocessing hand-off,
  and download of released files are untouched.
- Default `fileNameScope: perEntry` preserves the wastewater `REF_aln_trim.bam` behavior exactly.
- Moving later from the manifest file to a metadata column (or vice versa), or to accession-based file
  references, are all incremental, non-breaking changes.
