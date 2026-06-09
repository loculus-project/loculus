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

## Component shape

A Kubernetes **Job** (not a long-running Deployment) gated on a new dev-only value. Built from the
`integration-tests/` image (Playwright + node_modules already present) with a non-test entrypoint.

```
integration-tests/
  seed/
    SPEC.md            <- this file
    seed.ts            <- standalone entrypoint (launches chromium, composes page objects, then pg insert)
  Dockerfile           <- (new or extended) builds an image usable as both test-runner and seeder
```

`seed.ts` outline (all calls are existing page-object methods unless noted):

```ts
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ baseURL: process.env.PLAYWRIGHT_TEST_BASE_URL });

// idempotency: bail if the seed user already exists (login succeeds)
if (await new AuthPage(page).login(SEED_USER, SEED_PW)) { log('already seeded'); process.exit(0); }

await new AuthPage(page).createAccount(seedAccount);
const groupId = await new GroupPage(page).createGroup(buildTestGroup('seed-group'));

const accessions: string[] = [];
for (const s of SEED_SEQUENCES) {                       // ~3 sequences
  const review = await submissionPage.completeSubmission(
    { ...s, groupId: String(groupId) }, s.sequenceData); // dummy-organism form
  await review.waitForAllProcessed();                    // dummy pipeline runs in-cluster
  await review.releaseAndGoToReleasedSequences();
  accessions.push(await readAccession(page));            // small helper (parse released table/URL)
}

const { seqSetId, seqSetVersion } =                      // createSeqSet returns id+version (parse from URL)
  await new SeqSetPage(page).createSeqSet({
    name: 'Seed SeqSet', description: 'Auto-seeded for dev',
    focalAccessions: [accessions[0]], backgroundAccessions: accessions.slice(1),
  });

// citation: call the superuser-only endpoint with a super-user token
const superUserToken = await getToken('superuser', 'superuser'); // keycloak password grant
await page.request.post(`${BACKEND_URL}/create-curated-citation`, {
  headers: { authorization: `Bearer ${superUserToken}` },
  data: {
    seqSetId, seqSetVersion,
    source: {
      sourceDOI: '10.0000/seed-citation-1', title: 'Seed reference publication',
      year: 2024, contributors: [{ givenName: 'Ada', surname: 'Lovelace' }],
    },
  },
});
await browser.close();
```

Two small additions to the page-object layer are needed (both trivial, reusable by future tests):
- `SeqSetPage.createSeqSet` should return `{ seqSetId, seqSetVersion }` (parse from the post-create URL).
- a `readAccession(page)` helper to pull the accession of a just-released sequence.

## Kubernetes wiring

New template `kubernetes/loculus/templates/seed-test-data-job.yaml`:

- `kind: Job`, gated: `{{- if .Values.seedTestData.enabled }}` (whole file).
- Image: `ghcr.io/loculus-project/integration-tests:{{ $dockerTag }}` (new image built in CI from
  `integration-tests/Dockerfile`), `command: ["node", "seed/seed.js"]`.
- Env:
  - `PLAYWRIGHT_TEST_BASE_URL: http://loculus-website-service:3000` (verified service name,
    `templates/website-service.yaml`).
  - `DB_URL` / `DB_USERNAME` / `DB_PASSWORD` from the `database` secret (same refs as backend).
- **Ordering / readiness:** website + backend + dummy-preprocessing must be up before it runs.
  Two viable mechanisms (pick one):
  1. **ArgoCD PostSync hook** (mirror `templates/ingest.yaml:127` `loculus-ingest-trigger`):
     `argocd.argoproj.io/hook: PostSync`, `backoffLimit`, `ttlSecondsAfterFinished: 600`.
     Cleanest fit with how this repo already bootstraps post-deploy work.
  2. Plain Job + an init-container that curls `…/website` and `…/backend` health until ready.
  > **Recommendation:** PostSync hook (option 1) — consistent with `ingest-trigger`.
- `backoffLimit: 1`, `ttlSecondsAfterFinished: 600`, `restartPolicy: Never`.

### Values

`kubernetes/loculus/values.yaml` (default OFF, production-safe):
```yaml
seedTestData:
  enabled: false
  user: { username: seed_user, password: seed_user }
  organism: dummy-organism
  sequenceCount: 3
```
`kubernetes/loculus/values_e2e_and_dev.yaml` (turn ON for dev/E2E):
```yaml
seedTestData:
  enabled: true
```
Add the `seedTestData` object to `values.schema.json`, then:
`npx prettier@3.6.2 --write kubernetes/loculus/values.schema.json` and
`helm lint kubernetes/loculus -f kubernetes/loculus/values.yaml` (per `kubernetes/AGENTS.md`).

## Idempotency & safety

- Re-running on an already-seeded cluster is a no-op (seed user login check up front).
- `enabled: false` by default → never runs in production. The CURATED-citation SQL and the
  `database` secret mount only exist on dev because the whole template is gated.
- Uses the dummy organism only, so no real pathogen data or real DOIs/CrossRef calls.

## Decisions

1. **Citation mechanism — DECIDED: new superuser-only `POST /create-curated-citation` endpoint**
   (implemented in this branch). Seed job calls it with a super-user token; no DB secret needed.
2. **Submission driver — DECIDED: Playwright UI**, reusing the integration-test page objects.

## Open questions for reviewer

1. **Trigger:** ArgoCD PostSync hook (recommended) vs. readiness-gated plain Job.
2. **Image:** extend the existing `integration-tests` image with a `seed/` entrypoint
   (recommended) vs. a separate slimmer image.
```
