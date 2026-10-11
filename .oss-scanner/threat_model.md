# Loculus threat model

Anthropic's OSS Scanner (<https://github.com/anthropics/oss-scanner>) reads this before scanning loculus-project/loculus.
`SECURITY.md` is the project's security policy; where this file and it differ, `SECURITY.md` wins.

## What Loculus is

Loculus is self-hosted software for running pathogen genomic sequence databases (for example Pathoplexus and GenSpectrum).
Submitters log in, join a *submitting group*, upload sequences and metadata, review the processed result and approve it for release.
Released data is public and is searched through LAPIS/SILO.
Each instance is run independently by its operator from the Helm chart in `kubernetes/`.

Main components in this repository:

- `backend/`: Kotlin/Spring Boot HTTP API and the only component that talks to Postgres and S3. All authorization decisions are made here.
- `website/`: Astro + React server-rendered site. Stores Keycloak access/refresh tokens in cookies and calls the backend and LAPIS on the user's behalf.
- `preprocessing/nextclade/`: Python pipeline that pulls unprocessed submissions from the backend, validates and transforms metadata, aligns sequences with Nextclade, and submits results back.
- `kubernetes/loculus/`: Helm chart, including the Keycloak realm config (`templates/keycloak-config-map.yaml`).
- `keycloak/keycloakify/`: custom Keycloak login theme.
- `cli/`: Python command-line client for the API.
- `ingest/`, `ena-submission/`, `raw-reads-processing/`, `taxonomy/`, `loculus-silo/`: operator-run jobs and services (NCBI ingest, ENA deposition, read processing, SILO wrapper).
- `.github/workflows/`: CI and image publishing.

LAPIS, SILO and Keycloak themselves are separate upstream projects and are out of scope, except where Loculus configures or feeds them insecurely.

## Actors and trust

From least to most trusted:

1. **Anonymous internet user.** Can browse released data, call public backend `GET` endpoints (see `SecurityConfig.kt`) and query LAPIS. Can usually self-register an account (`auth.registrationAllowed`).
2. **Registered user.** Anyone can become one. Can create groups, create SeqSets and request DOIs for them, and act on behalf of groups they belong to.
3. **Group member.** Can submit, edit, approve, revise and revoke sequences for that group, add or remove group members, and edit group details. Every member of a group has the same power over that group's data.
4. **Technical users with roles.** `preprocessing_pipeline` (fetches unprocessed data and submits processed data) and `external_metadata_updater` (ENA deposition writes back accessions). They are operator-controlled and trusted.
5. **`super_user` (curator).** Can act on any group's data and use `/admin/*` and `/debug/*`. Trusted.
6. **Operator.** Controls Helm values, secrets, Keycloak admin and infrastructure. Fully trusted.

Roles come from the Keycloak JWT `realm_access.roles` claim.

## Security properties we care about

- **Group isolation before release.** Sequences, metadata, processing results and uploaded files are visible only to the submitting group (and super users) until they are approved and released. A non-member must not be able to read, modify, approve, revise, revoke or delete them. The same holds for group membership changes.
- **Release integrity.** Only released, non-revoked versions should reach `get-released-data`, SILO/LAPIS, public file URLs and downloads. Accession and version history should not be forgeable or rewritable by a non-member.
- **Role boundaries.** A registered user must not gain `super_user`, `preprocessing_pipeline` or `external_metadata_updater` power, or call `/admin/*` or `/debug/*`.
- **Data use terms.** Restricted data must be labelled as restricted wherever it is served. Restricted-until dates should only move in the directions the backend allows (see `DataUseTermsPreconditionValidator.kt`).
- **Session safety on the website.** User-submitted content is shown on public pages, which are visited by logged-in users and curators. Stored XSS, token leakage and open redirects in the login and logout flow all matter.
- **Server integrity.** No injection (SQL, path, command, template), unsafe deserialization or SSRF in the backend, website server, or preprocessing pipeline.

## Where untrusted input enters (highest priority first)

1. **Backend API** (`backend/src/main/kotlin/org/loculus/backend/controller/`), especially:
   - submission, revision and edit endpoints. These accept metadata TSV and FASTA, optionally compressed (zip, gzip, xz, zstd, bzip2). Check archive and decompression handling, accession and version handling, and group checks;
   - approve, revoke, delete and data-use-terms endpoints. Check per-accession ownership checks;
   - `/files/*`. Check presigned S3 upload and download URLs, and the released versus unreleased checks in `FilesController.kt`;
   - group management and SeqSet / DOI endpoints;
   - the matchers in `config/SecurityConfig.kt`, plus the ownership validators in `service/**/*PreconditionValidator.kt`.
2. **Website** (`website/src/`). Check `set:html` and `dangerouslySetInnerHTML` sinks (e.g. `DataTableEntryValue.tsx`, `Banner.tsx`), markdown and sanitization, the auth middleware and token cookies (`middleware/authMiddleware.ts`), redirect parameters, and server-side endpoints under `pages/` that proxy or stream data (e.g. `seq/[accessionVersion].fa`).
3. **Preprocessing pipeline** (`preprocessing/nextclade/src/`). It handles metadata and sequences written by any registered submitter. Look for parsing bugs and for values that flow unvalidated into processed data, filenames or subprocess arguments.
4. **Helm chart and Keycloak realm config.** Look for insecure defaults that would reach a production deployment.
5. **CI workflows.** Look for untrusted pull request content reaching secrets or publishing (`pull_request_target` and `workflow_run` triggers, image pushes).

Lower priority: `cli/` (runs as the user against a server the user chose), `ingest/` and `ena-submission/` (operator jobs that consume NCBI and ENA data), and `docs/`.

## How to exercise it

The image built by `.oss-scanner/Dockerfile` runs as root in `/src` with no network. Nothing is running at start.

- **Backend.** `cd /src/backend && ./gradlew --offline --console=plain test --tests 'org.loculus.backend.controller.submission.*'`.
  `USE_NONDOCKER_INFRA=true` is set in the image, so the tests start a local Postgres and MinIO (as `nobody`) instead of Docker.
  Tests are MockMvc-based. `controller/RequestAuthorization.kt` mints JWTs for any username and role set (`generateJwtFor`), and the `controller/**/*Client.kt` helpers (e.g. `SubmissionConvenienceClient.kt`) wrap each endpoint. Writing a new MockMvc test is the easiest way to reproduce an authorization bug.
  The full suite is slow, so prefer `--tests` filters.
- **Website.** `cd /src/website && npm run test` (vitest, with `CI=1` set in the image). `npm run check-types` also works offline.
  Running the site end to end needs a backend, Keycloak and LAPIS, which the image does not have. Use unit tests or source-level reasoning for website findings.
- **Preprocessing.** `cd /src/preprocessing/nextclade && PATH="$PREPROCESSING_ENV/bin:$PATH" pytest`. The env's `bin/` must be on `PATH` because the pipeline shells out to `nextclade3` and `diamond`. Test configs and datasets are in `tests/`.
- **CLI.** `cd /src/cli && uv run --offline loculus --help`.
- Integration tests (`integration-tests/`, Playwright) need a full Kubernetes deployment and cannot run here.

## How we rate severity

- **Critical:** unauthenticated, or any self-registered user, can run code on a server; gain `super_user` or a pipeline role; or approve, modify, revoke or delete another group's data.
- **High:** a non-member can read another group's unreleased sequences, metadata or files. Stored XSS that a submitter can plant on pages other users visit. SQL injection. SSRF from the backend or website server to internal services.
- **Medium:** reflected XSS or open redirect that needs user interaction. Leaks of non-public user or group information (for example email addresses beyond what the UI already shows to the same viewer). Restricted data served without its restricted label. Denial of service that one authenticated request can trigger (for example a decompression bomb in a submission).
- **Low:** anything else with a real security impact but a narrow precondition.

Findings that need `super_user`, a pipeline role, operator access or Keycloak admin are generally out of scope, unless they cross into the database server or host.

## Out of scope / do not report

- Default credentials and secrets in `kubernetes/` values that only apply to local development, preview or CI deployments. Report a default only if an operator following the production docs would inherit it.
- Behaviour that is intended by design: any group member can act on all of that group's data; registered users can create groups; released data, including restricted data, is public.
- Missing rate limiting, volumetric DoS, or issues that only affect a specific instance's configuration.
- Vulnerabilities in LAPIS, SILO, Keycloak or other upstream dependencies, unless Loculus uses them in an unsafe way. Generic "outdated dependency" reports.
- Test-only code under `*/tests/`, `backend/src/test/` and `integration-tests/`.

## Reports and patches

Include the commit scanned, the affected component, exact file and line references, the attacker role needed, and a reproducer. The reproducer should ideally be a failing backend MockMvc test, a vitest test or a pytest case.
Proposed patches should be minimal and add a regression test. Follow the `AGENTS.md` files (repository root, `backend/`, `website/`).
