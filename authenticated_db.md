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

Constraint: response bodies must stream rather than buffer. Request bodies are
small JSON query documents and are buffered.

**Implemented** (proof of concept):

- `website/src/pages/lapis/[organism]/[...path].ts` — the proxy, plus a spec
  alongside it.
- `requireLogin` flag: `website/src/types/config.ts`, `loginIsRequired()` in
  `website/src/config.ts`, `kubernetes/loculus/values.yaml`,
  `values.schema.json`, and the website config block of `_common-metadata.tpl`.
- `loculus.publicRuntimeConfig` sets the public LAPIS URL template to
  `<websiteUrl>/lapis/%organism%` when `requireLogin` is set. An explicit
  `public.lapisUrlTemplate` still takes precedence.

The Helm templates have not been rendered — `helm template --set
requireLogin=true` must be run before relying on them.

#### Content encoding

Node's `fetch` decodes gzip, deflate and br transparently — including when the
request sends `Accept-Encoding: identity` — while leaving the upstream
`content-encoding` and `content-length` headers on the response. It does not
decode zstd. Forwarding response headers verbatim therefore labels an already
decoded body as compressed.

The proxy requests `identity` from LAPIS, always drops `content-length`, and
drops `content-encoding` only for the encodings `fetch` decodes. zstd passes
through with its header intact, which is what the download dialog's
`compression=zstd` option relies on. The edge (Traefik
`compression-middleware`) compresses the response to the browser.

### Phase 2 — close the direct routes

- Drop the `lapis-ingress.yaml` host, or place Traefik forward-auth +
  oauth2-proxy in front of it if a machine-usable API endpoint is required.
- Gate the pages that render sequence data server side.
- Tighten the `*` CORS headers in `createDownloadAPIRoute.ts` and the
  `cors-all-origins` middleware.
- Review `Cache-Control: public` responses.

**Implemented** (proof of concept), all guarded by `requireLogin`:

- `lapis-ingress.yaml` renders nothing, so LAPIS has no public host and the
  `cors-all-origins` middleware that carried `Access-Control-Allow-Origin: *`
  is gone with it. Nothing else references the middlewares defined there.
- `shouldMiddlewareEnforceLogin` takes a third `requireLogin` argument. When it
  is set, every route is gated except an explicit allowlist in
  `ROUTES_THAT_STAY_PUBLIC`: the error pages, `/logout`, the client log
  endpoint, `/loculus-info`, `/api-documentation`, `/docs`, `/about` and static
  assets. That list is the entire access policy of a private instance. One
  visible consequence: an unmatched URL sends a logged out visitor to the login
  rather than to the 404 page.
- `isApiRoute` marks the endpoints that code fetches — the LAPIS proxy,
  `/seq/<av>.fa`, `/seq/<av>.tsv`, `/seq/<av>/details.json`. `authMiddleware`
  answers 401 for those instead of redirecting, so a caller does not receive an
  HTML login page under a `.fa` file name.
- `createDownloadAPIRoute.ts` and `details.json.ts` only send
  `Access-Control-Allow-Origin: *` on instances whose data is public.

#### Server-side rendering is itself an egress path

Closing the LAPIS host is not sufficient on its own.
`[organism]/search/index.astro` calls `performLapisSearchQueries` during server
side rendering, over the internal cluster URL, with no reference to the
session. The same applies to the sequence details pages and to the landing
page, which renders per organism sequence counts through
`getOrganismStatisticsMap`. Without page gating, an anonymous visitor still
receives rendered data from a website whose LAPIS is off the internet.

This is why page gating belongs in this phase rather than being an independent
line item.

#### Not closed by this phase

The backend keeps its public host and its public GET endpoints, including
`/*/get-released-data`, which returns everything released. Until phase 3 lands,
the data remains readable without a session.

`Cache-Control: public` on `/search-index.json` needs no change: the index is
built from `pages/docs/**` and `pages/about/**` only, so it holds no instance
data.

The `Access-Control-Allow-Origin: *` in
`seq/[accessionVersion]/[fileCategory]/[fileName].ts` is untouched, since S3
file sharing is disabled and out of scope.

### Phase 3 — backend

Gate `getEndpointsThatArePublic` on a Spring property
(e.g. `loculus.require-authentication`) defaulting to current behaviour.

Give the SILO importer a Keycloak service account, reusing the pattern in
`preprocessing/nextclade/src/loculus_preprocessing/backend.py:37`.

**Implemented** (proof of concept):

- `SecurityConfig` takes `loculus.require-authentication`, default false. When
  set, the GET and HEAD allowlists are not registered and those endpoints fall
  through to `anyRequest().authenticated()`. `/actuator/**`, `/api-docs**` and
  the other operational paths are permitted separately and are unaffected.
  `loculus-backend.yaml` passes the flag from `requireLogin`.
- The SILO importer authenticates. `loculus-silo/src/silo_import/auth.py` holds
  a `TokenProvider` that uses the password grant and caches the token until it
  nears expiry, and `ImporterConfig` reads `KEYCLOAK_TOKEN_URL`,
  `KEYCLOAK_USER` and `KEYCLOAK_PASSWORD`. All three are required together: a
  partially configured importer would otherwise fall back to anonymous requests
  and only fail once the backend rejected them.
- A `silo_import` service account is added to the Keycloak realm, with its
  password autogenerated into the `service-accounts` secret and wired through
  the config processor. The credentials reach the importer only when
  `requireLogin` is set.
- The website passes its session token on the calls that are no longer public:
  the data use terms history, the seqset and citation endpoints and
  `get-author`. `getGroupDetails` already passed one.

#### Which role

The realm already defines an unused `get_released_data` role, and
`external_metadata_updater` already holds it. The `silo_import` account is
given the same role, but the backend does not check it: on a `requireLogin`
instance every authenticated user may read data, which is the whole access
model. Restricting the bulk dump endpoint to holders of that role would be a
sensible tightening and is a two line change in `SecurityConfig`.

#### Not covered

Two consumers of `/get-released-data` still send no token. Both are follow-ups
rather than oversights.

`ena-submission/src/ena_deposition/call_loculus.py`, `fetch_released_entries`.
ENA deposition is disabled by default (`disableEnaSubmission: true`) and is not
exercised here. The fix is not simply to add the header: the only caller,
`scripts/get_ena_submission_list.py`, imports `fetch_released_entries` and
nothing else from that module, so that cronjob contacts Keycloak nowhere today.
An unconditional `get_jwt(config)` ends in `raise_for_status()`, which would
make a Keycloak outage fail the job on a public instance, where nothing is
gated. The header has to be conditional on the instance requiring a login, or
its failure has to be tolerated. The credentials themselves are available -
`keycloak_token_url`, `username` and `password` are required `Config` fields
that the cronjob already loads.

`cli/src/loculus_cli/api/backend.py:189`, `get_released_data`. It has no caller
anywhere in the CLI, so it was left alone rather than given a speculative
`username` parameter. It will need one when it acquires a caller.

### Phase 4 — access policy

Set `auth.registrationAllowed: false` and `robotsNoindexHeader: true` — both
existing Helm values, no code. Decide between invite and admin-approval for
account creation.

**Implemented** (proof of concept), Helm only:

- `auth.registrationAllowed` and `robotsNoindexHeader` are unset in
  `values.yaml` and derived in `_access-policy.tpl`: unset means
  `not requireLogin` and `requireLogin` respectively. Both stay overridable, so
  an instance that gates its data but still wants open sign-up can say so.
  Helm's `default` is unusable here because it treats an explicit `false` as
  unset, hence the `kindIs "invalid"` checks.
- `validate-access-policy.yaml` renders nothing and exists so that
  `loculus.validateAccessPolicy` runs on every render. It fails the chart on
  `requireLogin` with `readOnlyMode`, which forces every session logged out, and
  on `requireLogin` with `disableWebsite`, which removes the `/lapis` proxy that
  is the only remaining way in to LAPIS. The first was recorded as a risk in
  phase 1 and is now enforced.

`values_e2e_and_dev.yaml` sets neither, so with `requireLogin` off it resolves
to exactly today's behaviour and the integration tests that register accounts
keep working. `values_preview_server.yaml` sets both explicitly and is
unaffected.

#### No website change is needed

Keycloakify's `Login.tsx` already hides the registration link behind
`realm.registrationAllowed`, so the login screen is correct once the realm flag
is off.

The website's only "Login or register" text is `NeedToLogin.astro`, and its four
call sites are all on pages that phase 2 gates. A logged out visitor is sent to
Keycloak before any of them render, so the label is unreachable on a private
instance and does not need to become conditional.

#### Account creation

With self registration off, accounts are created by an administrator in the
Keycloak console. That needs no code and is where this leaves things.

An invite flow or self service with admin approval is a separate piece of work:
Keycloak has no built-in invite, so it means either a Keycloak extension or a
backend endpoint that creates users through the admin API, plus the token
handling and the emails around it. Worth scoping on its own rather than
folding into this change.

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

| Item | Effort | Status |
| --- | --- | --- |
| Disable S3 | 1 Helm value | |
| Website LAPIS proxy route (streaming) | 2–3 d | done |
| Website middleware flag | 0.5 d | done |
| Helm: `lapisUrlTemplate`, new value + schema | 1 d | done, unrendered |
| Helm: guard `lapis-ingress`, CORS | 0.5 d | done, unrendered |
| Backend `SecurityConfig` flag | 0.5–1 d | done, not compiled |
| SILO importer service-account token | 1–1.5 d | done, not run |
| Keycloak registration policy | 0.5 d (config only) | done, unrendered |
| Playwright `storageState` + 4 skips | 1–2 d | |

**Total: 1.5–2 weeks** for a flag-guarded implementation with the integration
suite green. **1.5–2 days** for a spike proving the proxy end to end.

Optional, adds 2–3 days and the 7 CLI specs: thread the existing token store
into `cli/src/loculus_cli/api/lapis.py` and keep a bearer-token-accepting LAPIS
edge, so `loculus get` continues to work.

## 6. Risks

- **None of the backend or importer code has been executed.** The development
  environment has no JDK, so the Kotlin does not compile here, and the Python
  test dependencies are not installable offline, so the importer's tests do not
  run. Helm is not installed either. The website suite is the only part that a
  tool has checked. Run `./gradlew test`, the `loculus-silo` pytest suite and
  `helm template --set requireLogin=true` before trusting any of it.
- **Streaming large downloads through the Node website process** is still
  unvalidated against a live LAPIS. The proxy streams response bodies, but no
  multi-gigabyte download has been exercised. Fallback is edge-proxying with
  `SameSite=None` cookies and credentialed CORS, which is noticeably more
  fiddly.
- **`requireLogin` and `readOnlyMode` are mutually exclusive.** Read-only mode
  makes the auth middleware force `isLoggedIn: false`, so the proxy would
  reject every query. The chart refuses the combination since phase 4.
- **`deploy.py generate-config --from-live`** sets
  `usePublicRuntimeConfigAsServerSide`, which points a locally run website's
  server-side LAPIS URL at the remote instance's proxy, with no session
  attached. That development workflow does not work against a `requireLogin`
  instance.
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
