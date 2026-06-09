# Spec: `seed-test-data` — dev-only test-data seeding component

## Goal

A new component that runs **inside the Kubernetes cluster on dev/E2E deployments only** and
seeds a realistic slice of SeqSet-citation test data, so that the SeqSet + citation features
(PR #6304) are visibly populated on a fresh dev deployment without a human clicking through the UI.

On each fresh dev deploy it will:

1. Register a seed user + create a group.
2. Submit a handful of sequences to the **dummy organism**, drive them through the dummy
   preprocessing pipeline, and **release** them (so they get accessions).
3. Create a **SeqSet** referencing those released accessions (focal + background).
4. Insert a **manual ("CURATED") citation** of that SeqSet into the database.

## Why reuse the integration tests

The whole submit→preprocess→release→seqset flow is already implemented as Playwright page
objects in `integration-tests/`. Rather than re-deriving the backend REST choreography, the
seed component is a thin entrypoint that drives those same page objects against the in-cluster
website. This keeps the seed path and the test path exercising identical code.

Reused page objects (all under `integration-tests/tests/pages/`):

| Page object | Method(s) used | Source |
|---|---|---|
| `AuthPage` | `createAccount` / `tryLoginOrRegister` | `auth.page.ts:12` |
| `GroupPage` | `createGroup` | `group.page.ts:25` |
| `SubmissionPage` | `fillSubmissionFormDummyOrganism`, `fillSequenceData`, `acceptTerms`, `completeSubmission` | `submission.page.ts:101,116,136` |
| `ReviewPage` | `waitForAllProcessed`, `releaseAndGoToReleasedSequences` | `review.page.ts:121,160` |
| `SeqSetPage` | `gotoList`, `createSeqSet` | `seqset.page.ts:15,31` |

Reused helpers: `buildTestGroup` (`utils/testGroup.ts:23`), sequence constants in
`test-helpers/test-data.ts`, and the dummy-organism display name **"Test Dummy Organism"**
(`kubernetes/loculus/values.yaml:1776`).

## The citation mechanism

Citations land in the DB two ways (`backend/.../db/migration/V1.29__add_seqset_citations_table.sql`):

- `origin = 'CROSSREF'` — written by the scheduled `SeqSetCrossRefCitationsTask` that polls the
  CrossRef cited-by API every 6h. Not reproducible on a dev cluster (no real CrossRef, no real DOIs).
- `origin = 'CURATED'` — now written by the **`POST /create-curated-citation`** backend endpoint
  added in this branch (superuser-only). See `SeqSetCitationsController.createCuratedCitation`.

The seed job creates the manual citation by calling that endpoint with a **super-user** token:

```
POST /create-curated-citation        (Authorization: Bearer <super-user JWT>)
{
  "seqSetId": "<from createSeqSet>",
  "seqSetVersion": 1,
  "source": {
    "sourceDOI": "10.0000/seed-citation-1",
    "title": "Seed reference publication",
    "year": 2024,
    "contributors": [{ "givenName": "Ada", "surname": "Lovelace" }]
  }
}
```

The endpoint enforces `authenticatedUser.isSuperUser` (else 403), validates the SeqSet exists
(else 404), upserts the citation source (reusing an existing DOI row if present), then links it to
the SeqSet version. The link is by `(seqset_id, seqset_version)`, so **no minted DOI is required**.

> **Implications for the seed job:** no DB secret needed — it's a plain authenticated HTTP call via
> Playwright's `page.request` (or `fetch`). The citation step must use a token with the `super_user`
> realm role. Recommend logging in as the existing dev superuser (`superuser`/`superuser`, created
> when `createTestAccounts: true`) for that one call, while the submit/seqset steps use the seed user.

## Component shape (as implemented)

The seeder is a **Playwright project** (`seed`) running a single setup file, packaged in a new
`integration-tests` image and run in-cluster by a Helm-hook **Job**. No bespoke Node entrypoint and
no DB access — it drives the existing page objects and calls the new citation endpoint over HTTP.

```
integration-tests/
  seed/SPEC.md                 <- this file
  tests/seed.setup.ts          <- the seed setup (reuses page objects; the whole flow)
  playwright.config.ts         <- adds the RUN_SEED-gated `seed` project
  package.json                 <- `npm run seed` => RUN_SEED=true playwright test --project=seed
  Dockerfile                   <- mcr.microsoft.com/playwright image; CMD ["npm","run","seed"]
kubernetes/loculus/templates/seed-test-data-job.yaml   <- Helm-hook Job, gated on seedTestData.enabled
```

`tests/seed.setup.ts` runs everything **as the dev super user** (`superuser`/`superuser`), which can
submit, create SeqSets, and add curated citations — so a single login covers all four steps:

1. `AuthPage.login('superuser', …)`; `GroupPage.getOrCreateGroup(seedGroup)`.
2. Idempotency: `SeqSetPage.gotoList()`; if a `Seed SeqSet` cell exists, `setup.skip()`.
3. `BulkSubmissionPage` → `uploadMetadataFile` (submissionId/date/country/pangoLineage) +
   `uploadSequencesFile` → `submitAndWaitForProcessingDone` → `releaseAndGoToReleasedSequences`.
4. Collect released `LOC_…` accessions from the group's released page (poll-with-reload).
5. `SeqSetPage.createSeqSet({focal, background})`; read `seqSetId`/`version` from the
   `/seqsets/<id>.<version>` URL.
6. Read the `access_token` cookie from the logged-in context and `POST /create-curated-citation`
   (super-user token) via a backend `APIRequestContext`.

No page-object changes were required — `createSeqSet`'s result is recovered from the detail URL, and
accessions are read with the same `LOC_` regex the seqset test uses.

### Gating it so normal runs never seed

The `seed` project is only added to `playwright.config.ts` when `RUN_SEED=true`. `seed.setup.ts` ends
in `.setup.ts`, so no other project's `testMatch` picks it up. Default `npm test` therefore never runs it.

## Kubernetes wiring (as implemented)

`kubernetes/loculus/templates/seed-test-data-job.yaml`:

- `kind: Job`, whole file gated on `{{- if .Values.seedTestData.enabled }}`.
- **Helm hooks** `post-install,post-upgrade` with `hook-delete-policy: before-hook-creation`, so it
  re-runs on each deploy and is recreated cleanly (avoids the immutable-Job problem on `helm upgrade`).
  Plain Helm (deploy.py/k3d) runs it as a post-deploy hook; Argo CD honours Helm hooks too — so this
  one mechanism covers both, no separate Argo annotations needed.
- **Readiness:** an init container (`curlimages/curl`) loops until the website and backend respond,
  so the seeder doesn't start before services are up.
- Image `{{ .Values.images.integrationTests.repository }}:{{ tag|default dockerTag }}`, built in CI
  from `integration-tests/Dockerfile`; `command: ["npm","run","seed"]`.
- Env: `PLAYWRIGHT_TEST_BASE_URL=http://loculus-website-service:3000`,
  `PLAYWRIGHT_TEST_BACKEND_URL=http://loculus-backend-service:8079`,
  `SEED_SUPER_USER` / `SEED_SUPER_USER_PASSWORD` from `seedTestData.superUser`. No DB secret.
- `activeDeadlineSeconds: 900`, `backoffLimit: 1`, `ttlSecondsAfterFinished: 86400`, `restartPolicy: Never`.

### Values

- `values.yaml` — adds `images.integrationTests` and a default-OFF `seedTestData` block
  (`enabled: false`, `superUser: {username: superuser, password: superuser}`).
- `values_e2e_and_dev.yaml` — `seedTestData.enabled: true`.
- `values.schema.json` — registers `images.integrationTests` (required: `images` has
  `additionalProperties: false`) and the `seedTestData` object.

Validated with `helm lint` (prod + dev values), `helm template` (Job renders only when enabled),
`prettier` on the schema, and `tsc`/`prettier`/`eslint` on the new TS.

## Idempotency & safety

- Re-running on an already-seeded cluster is a no-op (the `Seed SeqSet` existence check `setup.skip()`s).
- `enabled: false` by default → the whole template is gated, so it never renders in production.
- Uses the dummy organism only — no real pathogen data, no real DOIs/CrossRef calls.

## Decisions

1. **Citation mechanism — new superuser-only `POST /create-curated-citation` endpoint** (implemented
   in this branch). Seeder calls it with the super-user token; no DB secret.
2. **Submission driver — Playwright UI**, reusing the integration-test page objects.
3. **Run identity — the dev super user** for all steps (one login; can submit + seqset + cite).
4. **Trigger — Helm hooks** (post-install/upgrade), which work under both plain Helm and Argo CD.
5. **Image — extend the integration-tests image** with a `seed` Playwright project (RUN_SEED-gated).

## Validating on a live cluster (not yet done)

The flow is type-checked and the chart renders, but it has not been run end-to-end against a cluster.
Two assumptions to confirm there (both have a clear fallback):
- The dummy-organism **bulk** submission accepts `submissionId/date/country/pangoLineage`. If a field
  is rejected, adjust `METADATA_HEADERS`/`SUBMISSIONS` in `seed.setup.ts`.
- The website stores the Keycloak access token in an **`access_token` cookie** usable as a backend
  Bearer token. If not, swap the citation step to a Keycloak password-grant (needs a keycloak URL env).
