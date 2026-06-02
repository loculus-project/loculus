# 6. Runtime View

## Scenario 1 — Admin edits a released organism and publishes

```
Admin            Admin panel             Backend                 Postgres
  │ open organism    │                      │                       │
  ├─────────────────>│ GET .../draft        │                       │
  │                  ├─────────────────────>│ read draft or seed     │
  │                  │<─────────────────────┤ from current published │
  │ edit a field     │                      │                       │
  ├─────────────────>│ POST .../operations  │                       │
  │                  │ { operations:[op] }  │ validate (registry)    │
  │                  ├─────────────────────>│ apply to draft, bump   │
  │                  │                      │ revision, audit row    │
  │                  │<─────────────────────┤ { revision }           │
  │ click Publish    │                      │                       │
  ├─────────────────>│ POST .../publish     │ INSERT version,        │
  │                  ├─────────────────────>│ UPDATE current_version,│
  │                  │                      │ DELETE draft, audit     │
  │                  │<─────────────────────┤ { version: 44, ... }   │
  │  modal: "Published v44 — update organisms.<key>.configVersion   │
  │  to 44 in GitOps values or direct Helm, then roll SILO+LAPIS."  │
```

The backend and website need no rollout: the backend reads the DB directly, the website fetches the latest config per request. The pin bump is only for the organism's **SILO and LAPIS pods**, whose adapter init containers refetch at the new version when the rolling update brings them up. The admin UI should point to the rollout documentation instead of implying that every deployment can or should run a direct `helm upgrade`; GitOps/ArgoCD deployments update the watched values file instead.

The admin can make edits across several sub-pages (display, metadata, link-outs, …) before publishing; they all accumulate in one draft and publish together. A status banner shows the pending-change count.

## Scenario 2 — Admin rolls out the new version

```
values.yaml / GitOps: organisms.<key>.configVersion: 44
direct Helm: helm upgrade --set organisms.<key>.configVersion=44
  → Kubernetes detects the spec diff on the SILO and LAPIS Deployments
  → rolling update: new pod's adapter init container GETs ?version=44, renders files, exits 0
  → SILO starts; silo-importer reimports; pod becomes ready; old pod drained
  (old pod serves v43 throughout, until the new pod is ready)
```

A single Helm value drives both the SILO and LAPIS pod for an organism, so they always roll in lockstep and can never run mismatched schemas.

## Scenario 3 — Admin creates a new organism

```
POST /api/admin/config/organisms { key }      → row with status='unreleased', deployed=false
                                                 (+ current_processing_pipeline row, same txn)
PUT  /api/admin/config/organisms/{key}/draft  → full OrganismConfig; base_version=NULL
   (admin iterates with more PUTs, or pastes/edits JSON in the document editor)
POST /api/admin/config/organisms/{key}/publish→ version=1; status='released'; deployed remains false; draft deleted
then: add the key to values.yaml with configVersion=1 and apply it through GitOps/ArgoCD or direct Helm
then: after LAPIS is healthy, POST /api/admin/config/organisms/{key}/mark-deployed
```

Before the first publish, the whole document is replaceable (nothing depends on it yet). After release, only registry operations are allowed. Until the administrator marks the organism deployed, the public organism list and generated public organism-key enum hide it; pinned reads such as `/api/config/organisms/{key}?version=1` still work so the deployment adapter can fetch the config during rollout.

## Scenario 4 — Adapter pinned to a missing version

```
adapter init: GET /api/config/organisms/{key}?version=99  → 404
adapter: log error, exit 1
Kubernetes: pod stays in Init:Error; admin re-pins a kept version via helm upgrade.
```

## Scenario 5 — Concurrent draft edits

```
Admin A and Admin B both hold revision 7.
A posts an op  → accepted, revision becomes 8.
B posts an op  → 409 Conflict.
B's panel: toast "someone else edited this draft", refetches, admin redoes the change.
```

## Scenario 6 — Cosmetic instance edit

```
Admin edits the instance banner / a link-out label → PUT instance draft → publish.
No rollout. The website picks up the new instance/organism config within the
config cache window (~30s) at the next SSR request.
```
