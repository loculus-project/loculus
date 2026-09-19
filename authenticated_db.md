# Putting all database access behind authentication

Scope assessment and implementation plan for a Loculus fork in which no sequence
data is readable without a Keycloak login.

Working assumptions:

- S3 file sharing is disabled (`s3.enabled: false`) and out of scope.
- The change must stay mergeable with upstream `loculus-project/loculus`.

## 1. Current unauthenticated read surfaces

### 1.1 LAPIS / SILO

LAPIS is the read path for all released sequence data — not the backend's
Postgres. It is exposed on its own hostname by
`kubernetes/loculus/templates/lapis-ingress.yaml`, fronted by a Traefik
`cors-all-origins` middleware that sends `Access-Control-Allow-Origin: *`.

LAPIS is a third-party upstream image (`ghcr.io/genspectrum/lapis`, pinned in
`kubernetes/loculus/values.yaml`). It has no authentication support, and adding
it would mean forking a second project. Gating must therefore happen at the
edge or via a proxy.

The browser talks to LAPIS directly in roughly eight places — search,
autocomplete, hierarchical filters, reference selector, sequence viewer,
revision form, seqset records table, and the download dialog. All of them
resolve their URL through a single call, `getLapisUrl(clientConfig, organism)`
(`website/src/config.ts:351`), fed by `runtimeConfig.public.lapisUrls`.

The download buttons are plain `<a href>` links produced by
`website/src/components/SearchPage/DownloadDialog/DownloadUrlGenerator.ts`.
An `Authorization` header cannot be attached to those.

Server-side rendering uses `runtimeConfig.serverSide.lapisUrls`, which are
in-cluster service URLs, and is unaffected.

### 1.2 Backend public GET endpoints

`backend/src/main/kotlin/org/loculus/backend/config/SecurityConfig.kt:56`,
`getEndpointsThatArePublic`:

- `/*/get-released-data` — full dump of all released data
- `/data-use-terms/*`
- `/get-seqset`, `/get-seqset-records`, `/get-seqset-citations`,
  `/get-sequence-citations`, `/get-author`
- `/groups/*`
- `/files/get/**` — removed from scope with S3 disabled

`/*/get-released-data` is consumed unauthenticated by the SILO importer
(`loculus-silo/src/silo_import/config.py:80`).

### 1.3 Website

Only `/user`, `/<organism>/user` and `/<organism>/my_sequences` force login
(`website/src/utils/shouldMiddlewareEnforceLogin.ts`). Everything else renders
anonymously, including the data routes `/seq/<av>.fa`, `/seq/<av>.tsv`,
`/seq/<av>/details.json` and `/search-index.json`.
`website/src/utils/createDownloadAPIRoute.ts` sets
`Access-Control-Allow-Origin: *`; `/search-index.json` sets
`Cache-Control: public, max-age=3600`.

### 1.4 Keycloak

`auth.registrationAllowed` defaults to `true`
(`kubernetes/loculus/values.yaml:2849`). Open self-registration makes a login
gate meaningless.

### 1.5 CLI

`cli/src/loculus_cli/commands/get.py:104` constructs `LapisClient(lapis_url)`
with no token, using a URL obtained from the website's `/loculus-info`
endpoint. `loculus get` breaks as soon as LAPIS is gated.

## 2. Choke points

Every surface funnels through a single point of control, so no high-churn
React component needs to be touched.

| Surface | Choke point |
| --- | --- |
| Client-side LAPIS (all call sites) | `getLapisUrl(clientConfig, organism)`, fed by `loculus.generateExternalLapisUrls` (`kubernetes/loculus/templates/_urls.tpl:63`, used at `_common-metadata.tpl:633`) |
| Website pages and API routes | `website/src/utils/shouldMiddlewareEnforceLogin.ts` |
| Backend | `getEndpointsThatArePublic` in `SecurityConfig.kt` |
| Edge | `lapis-ingress.yaml`, `ingressroute.yaml` |

## 3. Plan

### Phase 1 — same-origin proxy for browser traffic

Add an Astro API route, e.g.
`website/src/pages/lapis/[organism]/[...path].ts`, that checks
`context.locals.session.isLoggedIn` and streams the request to the internal
LAPIS service URL. Point `lapisUrlTemplate` at
`https://<host>/lapis/%organism%`.

Rationale: the website's `access_token` cookie is already `httpOnly` with
`path: '/'` (`website/src/middleware/authMiddleware.ts`). Same-origin requests
carry it automatically, so search, autocomplete and the `<a href>` download
links all work with no CORS handling, no cross-subdomain `SameSite=None`
cookies, and no changes to React components. Token refresh already happens in
the middleware the proxy sits behind.

Constraint: the proxy must stream rather than buffer.

### Phase 2 — close the direct routes

- Drop the `lapis-ingress.yaml` host, or place Traefik forward-auth +
  oauth2-proxy in front of it if a machine-usable API endpoint is required.
- Tighten the `*` CORS headers in `createDownloadAPIRoute.ts` and the
  `cors-all-origins` middleware.
- Review `Cache-Control: public` responses.

### Phase 3 — backend

Gate `getEndpointsThatArePublic` on a Spring property
(e.g. `loculus.require-authentication`) defaulting to current behaviour.

Give the SILO importer a Keycloak service account, reusing the pattern in
`preprocessing/nextclade/src/loculus_preprocessing/backend.py:37`.

### Phase 4 — access policy

Set `auth.registrationAllowed: false` and `robotsNoindexHeader: true` — both
existing Helm values, no code. Decide between invite and admin-approval for
account creation.

## 4. Disabling tests for scoping

If the change is flag-guarded, the default path stays green and most suites
need no work:

- **Backend (Gradle).** The 18 files using `expectUnauthorizedResponse` pass
  unchanged while the property defaults to current behaviour. The S3/files
  tests are self-contained — `EndpointTestExtension.kt:182` sets
  `S3_ENABLED=true` itself and uses `backend_config_s3.json` — so disabling S3
  at deploy time does not affect them.
- **Website (vitest).** Same, for `shouldMiddlewareEnforceLogin.spec.ts`.
- **Playwright** is the only suite that breaks, since it runs against a
  deployed cluster in whichever mode is configured.

Of 54 specs, 35 already authenticate through the fixture chain
(`auth.fixture` → `group.fixture` / `sequence.fixture`); 7 CLI specs are
separate; **19 are truly anonymous**.

Most of the 19 do not assert anonymity — they merely run logged out. Add one
`login.setup.ts` setup project that authenticates once and writes
`storageState`, then set `use: { storageState }` on the browser projects in
`integration-tests/playwright.config.ts`. The repo already uses this pattern
(`readonly.setup.ts` plus `dependencies`). This rescues about 16 of the 19
without editing any spec.

Specs needing an explicit skip:

- `tests/specs/features/submission-login-required.spec.ts`
- `tests/specs/backend/authentication.spec.ts`
- `tests/specs/features/landing-page.spec.ts` (partially)
- `tests/specs/features/file-sharing.spec.ts` (S3 disabled)

For a pure scoping spike, an env-gated `testIgnore` array in
`playwright.config.ts` (~10 lines, one file) or running only
`tests/specs/auth tests/specs/group` is sufficient.

## 5. Effort

| Item | Effort |
| --- | --- |
| Disable S3 | 1 Helm value |
| Website LAPIS proxy route (streaming) | 2–3 d |
| Website middleware flag | 0.5 d |
| Helm: `lapisUrlTemplate`, guard `lapis-ingress`, CORS, new value + schema | 1–1.5 d |
| Backend `SecurityConfig` flag | 0.5–1 d |
| SILO importer service-account token | 1–1.5 d |
| Keycloak registration policy | 0.5 d (config only) |
| Playwright `storageState` + 4 skips | 1–2 d |

**Total: 1.5–2 weeks** for a flag-guarded implementation with the integration
suite green. **1.5–2 days** for a spike proving the proxy end to end.

Optional, adds 2–3 days and the 7 CLI specs: thread the existing token store
into `cli/src/loculus_cli/api/lapis.py` and keep a bearer-token-accepting LAPIS
edge, so `loculus get` continues to work.

## 6. Risks

- **Streaming large downloads through the Node website process** is untested
  and is the assumption most likely to fail. Validate it on day one of the
  spike. Fallback is edge-proxying with `SameSite=None` cookies and
  credentialed CORS, which is noticeably more fiddly.
- **Access is all-or-nothing.** SILO has no row-level security and no concept
  of a user; every authenticated user sees every released sequence. Per-user or
  per-group visibility of released data would be a fundamentally larger
  project — per-group SILO instances or a query-rewriting proxy.
- **LAPIS is a separate upstream project** with no auth roadmap under this
  fork's control.

## 7. Staying mergeable

Express every change as new files plus new config flags whose defaults
reproduce upstream behaviour. The proxy route is a new file; the Helm additions
are new templates; the backend and middleware changes are small and
flag-guarded. Conflict surface stays near zero across upstream refactors.

Loculus already carries `readOnlyMode`, `enableSubmissionPages` and
`enableLoginNavigationItem`. A `requireLogin` flag fits that idiom, and a
private-instance deployment mode is plausibly upstreamable — which would reduce
divergence to zero. Build it flag-guarded from the start to keep that option
open.
