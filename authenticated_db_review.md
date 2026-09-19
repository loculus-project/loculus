# Testing and reviewing the authenticated-database PoC

Companion to [authenticated_db.md](authenticated_db.md), which holds the design
and the phase-by-phase record. This document is the procedure for checking that
the proof of concept works and for reviewing it.

Branch: `wip/db-authentication`. Review range: `main..wip/db-authentication`.

The whole change is guarded by one Helm value, `requireLogin`, default `false`.
An instance that does not set it must behave exactly as it does on `main`, and
demonstrating that is as much a part of the testing as the new behaviour.

## 0. What has and has not been verified

Nothing below has been run except the website unit tests. The development
environment the PoC was written in has no JDK, no Helm, and no network to
install Python test dependencies. Treat every command in sections 1 and 2 as
unrun.

| Component | State |
| --- | --- |
| `website` unit tests | pass (774), 10 unrelated files fail to load from missing packages |
| `website` types and lint | clean on changed files |
| `backend` Kotlin | never compiled |
| `backend` new test | never run |
| `loculus-silo` | syntax-checked only |
| Helm templates | never rendered |

## 1. Static checks

Run each from the repository root unless stated otherwise. None of these
need a cluster.

### Backend

```sh
cd backend
./gradlew ktlintFormat
./gradlew test --console=plain
```

Use `USE_NONDOCKER_INFRA=true ./gradlew test --console=plain` if Docker is
unavailable. The suite is slow.

The new test is
`backend/src/test/kotlin/org/loculus/backend/controller/RequireAuthenticationEndpointTest.kt`.
Confirm all three of its cases run: the parameterised 401 case, the parameterised
"stays open" case, and the authenticated `get-released-data` case.

Every other backend test must still pass unchanged. Eighteen files use
`expectUnauthorizedResponse`; they exercise the default configuration and are
the regression check that the flag defaults off.

### SILO importer

```sh
cd loculus-silo
python -m pip install '.[test]'
python -m pytest tests/test_auth.py tests/test_config.py
mypy . --config-file .mypy.ini
ruff format --diff .
ruff check .
```

The full `pytest` run also needs the SILO binary built from LAPIS-SILO, as in
`.github/workflows/loculus-silo-tests.yml`. The two files above do not, so run
them first for a fast signal, then the full suite.

### Website

```sh
cd website
CI=1 npm run test
npm run check-types
npm run format
```

`CI=1` is required or vitest watches and never exits.

`npm run check-types` runs `astro check`, which is the only tool that type-checks
the `.astro` files. Several of those were edited in phase 3 and have not been
checked by anything.

### Helm

```sh
helm lint kubernetes/loculus -f kubernetes/loculus/values.yaml
helm lint kubernetes/loculus -f kubernetes/loculus/values.yaml -f kubernetes/loculus/values_e2e_and_dev.yaml
helm lint kubernetes/loculus -f kubernetes/loculus/values.yaml -f kubernetes/loculus/values_preview_server.yaml
```

These three are what `.github/workflows/helm-schema-lint.yaml` runs. They also
validate the schema change that made `auth.registrationAllowed` and
`robotsNoindexHeader` nullable.

## 2. Rendering the chart both ways

Create an overlay, referred to below as `values_require_login.yaml`:

```yaml
requireLogin: true
```

Render and compare:

```sh
helm template kubernetes/loculus -f kubernetes/loculus/values.yaml > /tmp/public.yaml
helm template kubernetes/loculus -f kubernetes/loculus/values.yaml \
  -f values_require_login.yaml > /tmp/private.yaml
diff /tmp/public.yaml /tmp/private.yaml
```

The diff must show all of, and only, the following:

- `lapis-ingress`, `lapis-redirect-ingress`, `cors-all-origins`,
  `strip-<organism>-prefix` and `redirect-slash` disappear.
- `noindex-robots-header` appears, and is added to the website and Keycloak
  middleware lists.
- The website config's `lapisUrls` point at `<websiteUrl>/lapis/<organism>`
  rather than the LAPIS host, and `requireLogin: true` appears in
  `website_config.json`.
- The backend gains `--loculus.require-authentication=true`.
- `"registrationAllowed": false` in the Keycloak realm config.
- The silo-importer container gains `KEYCLOAK_TOKEN_URL`, `KEYCLOAK_USER` and
  `KEYCLOAK_PASSWORD`.

The `silo_import` Keycloak user and its `siloImportPassword` secret key appear in
both renders. That is intended: the account exists either way, only the
credentials reaching the importer are conditional.

Then check that the guards fire:

```sh
helm template kubernetes/loculus -f kubernetes/loculus/values.yaml \
  --set requireLogin=true --set readOnlyMode=true      # must fail
helm template kubernetes/loculus -f kubernetes/loculus/values.yaml \
  --set requireLogin=true --set disableWebsite=true    # must fail
```

Both must abort with the message from `loculus.validateAccessPolicy`, not
render.

## 3. Deploying — read this first

The backend, the website and the SILO importer all ship as container images.
`deploy.py` resolves the tag from `--sha` (`commit-<sha7>`) or `--branch`, and
`main` resolves to `latest`. The usual local instruction in
`integration-tests/AGENTS.md` is `--branch main`, and **using it here would
deploy none of this work**: every change outside the Helm chart lives in those
images. The chart would render correctly against images that know nothing about
`requireLogin`, which fails in confusing ways.

So, before deploying: push the branch and open a pull request, so that
`backend-image`, `website-image` and `loculus-silo-image` build. They trigger on
`pull_request`. Then deploy by sha:

```sh
./deploy.py --verbose cluster --bind-all
./deploy.py --verbose helm --sha <commit-sha> --for-e2e \
  --enablePreprocessing --use-localhost-ip
./.github/scripts/wait_for_pods_to_be_ready.py --timeout 600
sleep 10
```

Confirm the pods are actually running the branch's images before trusting
anything:

```sh
kubectl get pods -o jsonpath='{range .items[*]}{.metadata.name}{"\t"}{.spec.containers[*].image}{"\n"}{end}'
```

## 4. Public instance — the regression check

Deploy as in section 3, without the overlay. Do this before testing the new
behaviour: nothing here may have changed.

Logged out:

| Check | Expected |
| --- | --- |
| `http://localhost:3000/` | renders, shows organism cards with counts |
| `http://localhost:3000/ebola-sudan/search` | renders results |
| `http://localhost:8080/ebola-sudan/sample/aggregated` | 200 |
| `http://localhost:8079/ebola-sudan/get-released-data` | 200 |
| Keycloak login page | shows the register link |

## 5. Private instance

Redeploy with the overlay:

```sh
./deploy.py --verbose helm --sha <commit-sha> --for-e2e \
  --enablePreprocessing --use-localhost-ip --values values_require_login.yaml
./.github/scripts/wait_for_pods_to_be_ready.py --timeout 600
sleep 10
```

`--for-e2e` adds `--skip-schema-validation`, so section 1's `helm lint` is what
covers the schema change.

### Logged out

| Check | Expected |
| --- | --- |
| `http://localhost:3000/` | redirect to Keycloak |
| `http://localhost:3000/ebola-sudan/search` | redirect to Keycloak |
| `http://localhost:3000/seq/<accession>` | redirect to Keycloak |
| `http://localhost:3000/lapis/ebola-sudan/sample/aggregated` | 401, `application/problem+json` |
| `http://localhost:3000/seq/<accession>.fa` | 401, not an HTML login page |
| `http://localhost:3000/seq/<accession>/details.json` | 401 |
| `http://localhost:8080/ebola-sudan/sample/aggregated` | 404 from Traefik: no route |
| `http://localhost:8079/ebola-sudan/get-released-data` | 401 |
| `http://localhost:8079/data-use-terms/<accession>` | 401 |
| `http://localhost:8079/groups/1` | 401 |
| `http://localhost:8079/actuator/health` | 200 |
| `http://localhost:8079/api-docs` | 200 |
| `http://localhost:3000/404` | renders, no redirect |
| `http://localhost:3000/logout` | renders, no redirect |
| `http://localhost:3000/loculus-info` | 200 |
| `http://localhost:3000/docs/concepts/metadataformat` | renders |
| Keycloak login page | no register link |
| Response headers on the website | `X-Robots-Tag: noindex, nofollow` |

For the backend checks a token is available from `./get_testuser_token.sh`.

### Logged in as `testuser` / `testuser`

| Check | Expected |
| --- | --- |
| Search page | results render, filters and autocomplete work |
| Browser network tab | LAPIS requests go to `/lapis/<organism>/...`, same origin |
| Sequence details page | renders, including the data use terms history |
| Metadata download, uncompressed | file downloads and is readable |
| Metadata download, zstd | file downloads and **decompresses**; see below |
| A download larger than a few hundred MB | completes; see below |
| Submission flow | unchanged |
| SeqSets pages | render |

### The two checks that matter most

**Compressed downloads.** Node's `fetch` decodes gzip, deflate and br
transparently while leaving the original `content-encoding` header in place, and
does not decode zstd. The proxy strips the header only for the encodings that
`fetch` decodes. If that logic is wrong the symptom is a downloaded `.zst` that
will not decompress, or a plain file that the browser tries to gunzip. Download
one of each and actually open them.

**Large downloads.** Every byte of a sequence download now passes through the
Node website process. The proxy streams rather than buffers, but this has never
been exercised against a real LAPIS. Watch the website pod's memory while a
large download runs. If it tracks the response size, the proxy is buffering
somewhere and the approach needs the edge-proxy fallback described in
[authenticated_db.md](authenticated_db.md).

### SILO importer

```sh
kubectl logs deploy/loculus-silo-ebola-sudan -c silo-importer
```

Expect `Requesting an access token from ...` once, then normal import logs, and
no repeat of the token request on each poll. A token request per poll means the
refresh-margin clamp in `silo_import/auth.py` is wrong.

Then confirm the pipeline end to end: submit a sequence, let preprocessing
approve it, and check it appears in search. That is the only check that proves
the importer's authenticated `get-released-data` call actually works.

## 6. Integration tests

Against the **public** deployment the suite must pass as it does on `main`:

```sh
cd integration-tests && npm ci
BROWSER=chromium TEST_SUITE=browser npx playwright test --workers=2
```

Against the **private** deployment it will fail broadly, and that is expected,
not a regression. Of 54 specs, 35 already authenticate through the
`auth.fixture` chain; 19 run anonymously. The planned fix — a `login.setup.ts`
setup project writing `storageState`, with `use: { storageState }` on the
browser projects — is scoped in `authenticated_db.md` but **not implemented**.

Four specs need an explicit skip even after that work:

- `tests/specs/features/submission-login-required.spec.ts`
- `tests/specs/backend/authentication.spec.ts`
- `tests/specs/features/landing-page.spec.ts` (partially)
- `tests/specs/features/file-sharing.spec.ts` (S3 is out of scope)

## 7. Review guide

Read in dependency order. The four `feat` commits are self-contained; the four
`docs` commits only touch `authenticated_db.md`.

### Phase 1 — `c34cfdc1c`

`website/src/pages/lapis/[organism]/[...path].ts`. The proxy. Scrutinise:

- Header filtering in both directions. Request: hop-by-hop, `host`,
  `content-length`, and the session credentials are dropped. Response:
  `content-length` always, `content-encoding` conditionally.
- Request bodies are buffered, response bodies streamed. Confirm the asymmetry is
  deliberate and that nothing awaits the response body.
- The route's own 401 is redundant with the middleware's since phase 2. Decide
  whether to keep it as defence in depth.

`kubernetes/loculus/templates/_common-metadata.tpl`, the `lapisUrlTemplate`
branch. An explicit `public.lapisUrlTemplate` must still win.

### Phase 2 — `d2a03c798`

`website/src/utils/shouldMiddlewareEnforceLogin.ts`. The `ROUTES_THAT_STAY_PUBLIC`
list is the entire access policy of a private instance. It is the single most
important thing to review, and the most likely to need adjusting for a given
deployment. It currently keeps `/docs`, `/about` and `/api-documentation` public
on the grounds that they hold no instance data.

`API_ROUTES` decides 401 versus redirect. Check the regexes against the real
route shapes: `/seq/<accessionVersion>.fa` where the accession itself contains a
dot.

`kubernetes/loculus/templates/lapis-ingress.yaml`. The guard wraps the whole
file. Confirm nothing outside it references the middlewares it defines.

### Phase 3 — `f39fbe614`

`backend/.../SecurityConfig.kt`. The only behavioural change is that two
`permitAll` registrations are skipped. Confirm nothing else in the chain
depended on them.

`loculus-silo/src/silo_import/auth.py`. Check the refresh margin arithmetic, the
`expires_in: 0` path, and that a token failure surfaces rather than silently
falling back to an anonymous request.

`loculus-silo/src/silo_import/config.py`, `_parse_keycloak_credentials`. The
all-or-none rule is deliberate.

The website token threading is mechanical but wide: `backendClient.ts`,
`seqSetCitationClient.ts`, the `seq/` chain and three `seqsets/` pages. Check
that every call that reaches a now-gated backend endpoint carries a token.

### Phase 4 — `17ef9fe86`

`kubernetes/loculus/templates/_access-policy.tpl`. The `kindIs "invalid"` checks
exist because Helm's `default` treats an explicit `false` as unset. Confirm the
derived values resolve to today's behaviour when `requireLogin` is off.

## 8. Known gaps

These are recorded in `authenticated_db.md` and do not need re-reporting.

- Per-user visibility is impossible. SILO has no row-level security; every
  authenticated user sees every released sequence.
- `loculus get` in the CLI queries LAPIS without a token and breaks on a private
  instance. Fixing it needs both a CLI change and a bearer-token-accepting LAPIS
  edge.
- `cli/src/loculus_cli/api/backend.py`, `get_released_data`, sends no token. It
  has no caller.
- `ena-submission`, `fetch_released_entries`, sends no token. ENA deposition is
  disabled by default. The fix must be conditional on `requireLogin`, because its
  cronjob contacts Keycloak nowhere today and `get_jwt` raises on failure.
- `deploy.py generate-config --from-live` does not work against a private
  instance: it points a local website's server-side LAPIS URL at the remote
  proxy with no session.
- S3 file sharing is out of scope and assumed disabled.
- The Playwright `storageState` work is scoped but not implemented.

## 9. Sign-off

- [ ] Backend tests pass, including the new one
- [ ] SILO importer tests and mypy pass
- [ ] Website tests, types and lint pass
- [ ] `helm lint` passes on all three values combinations
- [ ] Both renders diff as described, both guards fail as described
- [ ] Public deployment behaves as it does on `main`
- [ ] Private deployment passes every row of the logged-out and logged-in tables
- [ ] A zstd download decompresses
- [ ] A large download completes without the website pod's memory tracking it
- [ ] A submitted sequence reaches search through the authenticated importer
- [ ] The `ROUTES_THAT_STAY_PUBLIC` policy is right for this deployment
