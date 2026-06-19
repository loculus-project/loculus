# Plan: Proxy All LAPIS Calls Through the Backend

## Context

The website currently calls LAPIS directly (both from the browser and from SSR). The goals for proxying through the backend are:

- **Path decoupling**: The frontend will talk to backend-defined paths, not LAPIS's API schema. This allows LAPIS API changes to be absorbed at the backend without touching the frontend.
- **Future auth extension point**: Group-based authentication on specific endpoints can be added at the backend layer.

This plan does the initial migration — a generic wildcard proxy that preserves LAPIS paths for now. Once this is in place, specific endpoints can be replaced with typed, backend-defined routes incrementally.

Both SSR and browser calls will go through the proxy (simplifies config — `lapisUrls` can be removed entirely from `runtime_config.json`).

---

## Current LAPIS Call Inventory

### Endpoints used (all via `website/src/services/lapisApi.ts`):
- POST `/sample/details`
- POST `/sample/aggregated`
- POST `/sample/nucleotideMutations`
- POST `/sample/aminoAcidMutations`
- POST `/sample/nucleotideInsertions`
- POST `/sample/aminoAcidInsertions`
- POST `/sample/unalignedNucleotideSequences[/{segment}]`
- POST `/sample/alignedNucleotideSequences[/{segment}]`
- POST `/sample/alignedAminoAcidSequences/{gene}`
- GET  `/sample/lineageDefinition/{column}`

### Call sites:
- **LapisClient** (`website/src/services/lapisClient.ts`) — Zodios wrapper, used for SSR and some CSR
- **serviceHooks** (`website/src/services/serviceHooks.ts`) — React Query hooks (useAggregated, useDetails, useLineageDefinition, useGetSequence) — browser-side
- **GroupPage.tsx** (lines 323, 355) — direct `axios.post` to `/sample/aggregated`
- **SeqSetRecordsTableWithMetadata.tsx** (line 34) — direct `axios.post` to `/sample/details`
- **DownloadUrlGenerator.ts** (lines 156–172) — generates GET download URLs pointing at LAPIS

### How LAPIS URL is provided:
- SSR code uses `getRuntimeConfig().serverSide.lapisUrls[organism]`
- Browser/CSR code uses `getRuntimeConfig().public.lapisUrls[organism]`
- Both come from `runtime_config.json` injected via Kubernetes ConfigMap

---

## Current Routing Architecture

```
Browser   → Traefik → lapis-{host}/{organism}/ → loculus-lapis-service-{organism}:8080
Website SSR → (internal K8s) → loculus-lapis-service-{organism}:8080

After this change:
Browser   → Traefik → backend-{host}/{organism}/lapis/** → loculus-backend-service:8079
                                                         → loculus-lapis-service-{organism}:8080
Website SSR → (internal K8s) → loculus-backend-service:8079/{organism}/lapis/**
                             → loculus-lapis-service-{organism}:8080
```

---

## Implementation Steps

### 1. Backend: Add `lapisUrl` to per-organism config

**File: `backend/src/main/kotlin/org/loculus/backend/config/Config.kt`**

Add `lapisUrl: String` to `InstanceConfig` data class. This is how the backend knows which LAPIS service to forward to per organism.

**Test configs** — add `"lapisUrl": "http://localhost:8080"` to each organism entry in:
- `backend/src/test/resources/backend_config.json`
- `backend/src/test/resources/backend_config_single_segment.json`
- `backend/src/test/resources/backend_config_s3.json`
- `backend/src/test/resources/backend_config_data_use_terms_disabled.json`

### 2. Backend: Create `LapisProxyController`

**New file: `backend/src/main/kotlin/org/loculus/backend/controller/LapisProxyController.kt`**

- Route: `@RequestMapping("/{organism}/lapis")` with `/**` matching GET and POST
- Use `java.net.http.HttpClient` (Java 21 stdlib — no new dependencies)
- Manually validate organism via `backendConfig.organisms[organism]` (not `@ValidOrganism` — that returns 400; proxy should return 404 for unknown organisms)
- Build upstream URL: strip `/{organism}/lapis` prefix, append remaining path + query string, forward to `instanceConfig.lapisUrl`
- Forward safe headers: `accept`, `accept-encoding`, `content-type` — **strip `Authorization`** (LAPIS is a public read-only API)
- Return response as `StreamingResponseBody` (copy input stream → output stream with 8 KB buffer) — handles large FASTA downloads without memory buffering
- Strip hop-by-hop headers from upstream response (`connection`, `transfer-encoding`, etc.)

Key sketch:
```kotlin
@RestController
@RequestMapping("/{organism}/lapis")
class LapisProxyController(private val backendConfig: BackendConfig) {
    private val httpClient = java.net.http.HttpClient.newBuilder()
        .version(java.net.http.HttpClient.Version.HTTP_1_1).build()

    @RequestMapping(value = ["/**"], method = [RequestMethod.GET, RequestMethod.POST])
    fun proxy(@PathVariable organism: String, request: HttpServletRequest): ResponseEntity<StreamingResponseBody> {
        val instanceConfig = backendConfig.organisms[organism]
            ?: throw ResponseStatusException(HttpStatus.NOT_FOUND)
        // build target URL, forward request, stream response back
    }
}
```

### 3. Backend: Update `SecurityConfig`

**File: `backend/src/main/kotlin/org/loculus/backend/config/SecurityConfig.kt`**

Add `"/*/lapis/**"` to the public routes for both GET and POST (LAPIS is a public read-only API — no user auth required to query it).

### 4. Backend: Exempt LAPIS proxy from `ReadOnlyModeInterceptor`

**File: Find `ReadOnlyModeInterceptor.kt` (or equivalent `WebConfig.addInterceptors`)**

The interceptor blocks POST requests in read-only mode. POST to `/*/lapis/**` is a *read* (LAPIS queries), so exempt it:
- Either add path check in `preHandle`: `if (request.requestURI.contains("/lapis/")) return true`
- Or register the interceptor with `excludePathPatterns("/**/lapis/**")`

### 5. Kubernetes/Helm: Inject `lapisUrl` into backend config

**File: `kubernetes/loculus/templates/_common-metadata.tpl`**

In `loculus.generateBackendConfig`, add `lapisUrl` per organism using the internal K8s service name. Reuse the existing `loculus.lapisServiceName` helper:

```yaml
{{ $key }}:
  lapisUrl: "http://{{ template "loculus.lapisServiceName" $key }}:8080"
  schema:
    ...
```

### 6. Kubernetes/Helm: Update `runtime_config.json` to remove `lapisUrls`

**Files:**
- `kubernetes/loculus/templates/_common-metadata.tpl` (defines `loculus.publicRuntimeConfig`)
- `kubernetes/loculus/templates/loculus-website-config.yaml` (serverSide config)

Replace `lapisUrls` in both `public` and `serverSide` blocks. The website will compute the LAPIS proxy URL as `{backendUrl}/{organism}/lapis`.

`runtime_config.json` after change:
```json
{
  "public":     { "backendUrl": "https://backend-host", "keycloakUrl": "..." },
  "serverSide": { "backendUrl": "http://loculus-backend-service:8079", "keycloakUrl": "..." }
}
```

### 7. Website: Update `ServiceUrls` type and `getLapisUrl` helper

**File: `website/src/types/runtimeConfig.ts`**

Remove `lapisUrls` from the `ServiceUrls` Zod schema.

**File: `website/src/config.ts`**

Change `getLapisUrl(serviceConfig, organism)` to compute the URL from `backendUrl`:
```typescript
export function getLapisUrl(serviceConfig: ServiceUrls, organism: string): string {
    return `${serviceConfig.backendUrl}/${organism}/lapis`;
}
```

This is the only TypeScript change needed for most call sites — everything that calls `getLapisUrl()` will automatically point to the backend proxy. Verify that `LapisClient.createForOrganism()`, `serviceHooks.ts`, `GroupPage.tsx`, `SeqSetRecordsTableWithMetadata.tsx`, and `DownloadUrlGenerator.ts` all use `getLapisUrl()` or `lapisUrls[organism]` from config (and update any that don't).

### 8. Kubernetes: Keep LAPIS ingress for now

**File: `kubernetes/loculus/templates/lapis-ingress.yaml`**

Leave the existing LAPIS Traefik ingress in place as a direct-access escape hatch (for debugging, API consumers, Swagger UI links). Can be conditionally disabled with a `values.yaml` flag in a follow-up PR once traffic has fully moved.

---

## Deployment Order

1. Implement and test backend changes (steps 1–4) locally
2. Update Helm templates (steps 5–6) — must deploy backend and config together atomically
3. Deploy updated Helm chart — backend now receives LAPIS proxy traffic
4. Update website TypeScript (step 7) — can be deployed before or after Helm changes since `getLapisUrl()` is the sole abstraction point

---

## Verification

- **Unit test**: `LapisProxyControllerTest` — mock LAPIS server, verify GET/POST forwarding, header stripping, 404 for unknown organism, status code passthrough
- **Integration**: Deploy locally with `make` / docker-compose, check that search page loads (useAggregated/useDetails hooks), sequence details page loads (LapisClient SSR calls), and download dialog generates working download URLs
- **Streaming**: Download a multi-MB FASTA file via the proxy and confirm it completes without OOM/timeout
- **ReadOnlyMode**: Enable read-only mode and confirm LAPIS proxy POSTs still succeed
- **Auth**: Confirm an unauthenticated browser request to `/{organism}/lapis/sample/aggregated` succeeds (public route)

---

## Critical Files

| File | Change |
|------|--------|
| `backend/.../config/Config.kt` | Add `lapisUrl` to `InstanceConfig` |
| `backend/.../controller/LapisProxyController.kt` | New — generic proxy controller |
| `backend/.../config/SecurityConfig.kt` | Permit `/*/lapis/**` for GET + POST |
| `backend/.../ReadOnlyModeInterceptor.kt` (or WebConfig) | Exempt `/*/lapis/**` from write-block |
| `backend/src/test/resources/backend_config*.json` | Add `lapisUrl` field |
| `kubernetes/.../templates/_common-metadata.tpl` | Add lapisUrl to backend config; update publicRuntimeConfig |
| `kubernetes/.../templates/loculus-website-config.yaml` | Remove serverSide lapisUrls |
| `website/src/types/runtimeConfig.ts` | Remove `lapisUrls` from ServiceUrls |
| `website/src/config.ts` | Rewrite `getLapisUrl()` to derive from backendUrl |
