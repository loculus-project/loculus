---
title: Managing configuration
description: Editing the database-backed Loculus config through the admin dashboard and API
---

This is the practical guide to working with the database-backed configuration system: editing it through the admin dashboard, creating and updating organisms, rolling changes out to SILO and LAPIS, and scripting via the API. For the concepts behind it (the config layers, versioning model, and where each component reads config), start with the [Configuration system overview](../configuration-system/). For deployment-specific details after publishing an organism config, see [Rolling out organism config changes](../rolling-out-organism-config/).

A quick recap of the model used throughout this page: domain config (organism + instance settings) lives in the backend database as **immutable, versioned** documents; you edit a **draft** and **publish** it as a new version; a **released** organism can only be changed through small, named **operations** (e.g. `setOrganismDisplay`, `addLinkOut`, `reorderMetadataFields`); and every change is recorded in an audit log. Preprocessing-pipeline config is a separate, opt-in feature — see [Configuring pipelines in the admin panel](../configure-pipeline-admin-panel/) — and is not part of the versioned organism config.

## 1. The admin dashboard

### Access

The dashboard is at `/admin/config/` on your Loculus host. Access requires the `loculus_administrator` realm role in Keycloak. This role is separate from `super_user`; `super_user` is intended for curation powers such as acting on sequence entries across groups, not for changing instance configuration.

- An "Admin" link appears in the top navigation only when the logged-in user has the role.
- Anyone without the role gets a 403 when navigating to any `/admin/...` path.

To grant the role to a user:

1. Open the Keycloak admin console (e.g. `http://localhost:8083/admin/master/console/` in local dev).
2. Select the `loculus` realm.
3. Open the user → **Role mapping** → assign `loculus_administrator`.

The local development setup ships with a `loculus_administrator` account (password `loculus_administrator`) that already has the role when test accounts are enabled.

### Layout

The sidebar has three sections:

- **Instance** — edit the instance-level config (branding, banners, dataUseTerms, github links, etc.).
- **Organisms** — list all organisms (released + unreleased), create new ones, copy from existing ones, edit, view JSON, browse version history.
- **Audit** — the full audit log across all scopes.

Each organism also has its own per-organism pages:

| Page              | URL pattern                             | Purpose                                                                                  |
| ----------------- | --------------------------------------- | ---------------------------------------------------------------------------------------- |
| Document editor   | `/admin/config/organisms/<key>/draft`   | Raw JSON editor; used only for **unreleased** organisms                                  |
| Operations editor | `/admin/config/organisms/<key>/edit`    | Typed forms; used for **released** organisms                                             |
| JSON viewer       | `/admin/config/organisms/<key>/json`    | Read-only formatted JSON of the published config + any current draft, with a Copy button |
| History           | `/admin/config/organisms/<key>/history` | Published versions + audit log filtered to this organism                                 |

Trying to open the wrong-status page (e.g. the document editor on a released organism) automatically redirects to the right one.

### Useful patterns

- **Inspect a config without editing.** Use the **View JSON** action in the listing. Both the published version and the current draft (if any) are shown side-by-side with Copy buttons.
- **Validate before publishing.** The document editor performs client-side Zod parse + safeParse before sending the PUT; obvious schema errors surface inline. The backend validates again on publish; server-side errors are surfaced with the offending field path.
- **Concurrent editing.** The dashboard uses optimistic concurrency via `If-Match` revisions. If two admins edit the same draft, the second submit triggers a 409 → reload-toast UX: the dashboard re-fetches the draft and asks the admin to redo their change. No silent overwrites.
- **Discarding pending operations.** The operations editor has a "Discard pending operations" button that clears the draft without publishing.

## 2. Create and launch a new organism

This is the canonical path for a brand-new organism.

### Step 1 — Create an organism row

In the admin dashboard:

1. Go to **Organisms** in the sidebar.
2. Scroll down to **Create new organism**.
3. Enter a key (lowercase letters, digits, hyphens; must be unique).
4. Optionally pick **Copy config from** to seed the draft with another released organism's config. Useful when adapting an existing organism setup — the source's `schema.organismName` is replaced with the new key and `displayName` is cleared so the new organism doesn't accidentally show as the source.
5. Click **Create**.

You land in the document editor at `/admin/config/organisms/<key>/draft`. The organism is now `unreleased` — it exists as a row but has no published config yet.

### Step 2 — Fill in the draft

The document editor is a plain monospace JSON textarea. Paste or edit the full `OrganismConfig` document. Minimal shape:

```json
{
  "schema": {
    "organismName": "Example virus",
    "metadata": [
      { "name": "date", "type": "date", "required": true },
      { "name": "country", "type": "string", "autocomplete": true, "generateIndex": true }
    ],
    "tableColumns": ["date", "country"],
    "primaryKey": "accessionVersion",
    "defaultOrderBy": "submittedAtTimestamp",
    "defaultOrder": "descending"
  },
  "referenceGenome": {
    "nucleotideSequences": [{ "name": "main", "sequence": "ATCG..." }],
    "genes": []
  }
}
```

For richer configs (multi-segment, multi-reference, link-outs, preprocessing, lineage systems) see the canonical schema in `config-tools/src/schema/canonicalConfig.ts`. The easiest starting point is to copy from an existing organism — either via the **Copy config from** select on the create dialog, or by opening another organism's **View JSON** page.

Click **Save draft** as you go. Each save bumps the draft revision.

### Step 3 — Publish v1

When the draft looks right, click **Publish v1**. The backend validates the full document, writes it as the immutable version 1, and clears the draft. The organism flips from `unreleased` to `released`.

A modal appears with the published version, the exact config pin to update (`organisms.example-virus.configVersion=1`), a values.yaml example for GitOps/ArgoCD deployments, and a direct Helm example. The organism is now released but **not deployed**, so it is hidden from public organism lists until SILO/LAPIS are ready and an administrator marks it deployed. See [Rolling out organism config changes](../rolling-out-organism-config/) for how to choose the right workflow for your deployment.

### Step 4 — Roll out SILO + LAPIS for the new organism

This is the deployment-side step. SILO and LAPIS are templated per organism, so to start serving the new organism you need to:

1. Add the new organism to the values file used by the deployment, usually under `organisms` for environment-specific values or under `defaultOrganisms` in the in-repository defaults, with `configVersion: 1`. The per-organism scaffolding in `values.yaml` is deployment config: enabled flag, pinned config version, pipeline deployments, replicas, resource settings, and the pieces still needed by ingest/ENA-submission. The organism schema, metadata fields, reference sequences, link-outs, and file categories remain in the database-backed config.
2. Apply the values change. For GitOps/ArgoCD deployments, commit and push the values change and let ArgoCD sync. For direct Helm deployments, run a `helm upgrade` with the same configVersion pin. The dedicated [rollout guide](../rolling-out-organism-config/) shows both forms.

After the rollout, the `config-adapter` init container on each new SILO/LAPIS pod fetches `/api/config/organisms/example-virus?version=1` from the backend, renders `database_config.yaml`, `reference_genomes.json`, and `preprocessing_config.yaml` into the shared volume, and SILO/LAPIS start up against the new organism.

After the rollout is complete, check the organism's LAPIS endpoint and then return to **Admin → Organisms** and click **Mark deployed**. The public website will then include the organism in navigation and organism lists on the next request.

## 3. Update an organism

How you update a released organism depends on whether the change is **non-breaking** (display-only, additive) or **breaking** (changes that require SILO/LAPIS to re-ingest data).

### Non-breaking change — operations only

Examples: rename a display name, reorder metadata fields, add a link-out, change a field's header or description.

1. Go to **Organisms → edit** for the released organism.
2. The page lists the currently pending operations (if any) and shows one form per supported operation type. Available forms include:
   - **Set organism display** — displayName, organismName, image, description.
   - **Add optional metadata field** — name + type + optional display name (must be `required: false`; this is enforced as non-breaking by the validator).
   - **Set metadata field display** — pick a field, change displayName / header / description.
   - **Reorder metadata fields** — arrow buttons to reorder.
   - **Link-outs** — add a new link-out, or remove an existing one by name.
3. Each form's **Apply** button posts one operation; the operation appears in the **Pending operations** list at the top.
4. When all the operations look right, click **Publish**. The backend re-validates and writes a new immutable version.

These changes don't need a SILO/LAPIS rollout — the website re-derives its view model on the next request, picking up the new published config automatically. The pinned `configVersion` on SILO/LAPIS pods can stay at the previous version; the schema-level differences between the two versions don't affect the SILO data files.

### Breaking change — requires a SILO/LAPIS rollout

Examples: adding a metadata field that should be indexed (`generateIndex`), changing the reference genome, changing a field type, adding a lineage system, changing the per-segment shape — anything that affects what SILO indexes or how the preprocessing pipeline parses input.

The operation registry is intentionally narrow today, so most breaking changes don't have a dedicated admin-UI form yet. Two paths:

**A. Clone-and-replace via the admin dashboard.** Because the document editor only operates on **unreleased** organisms, the workflow for a breaking change is to create a new organism whose config differs:

1. Create a new organism with a different key (e.g. add a version suffix).
2. Use **Copy config from** to seed it from the existing one.
3. Edit the JSON to reflect the breaking change.
4. Publish v1 of the new organism.
5. Roll out SILO/LAPIS for the new organism (per [§2 step 4](#step-4--roll-out-silo--lapis-for-the-new-organism)) and migrate users / external links to the new key.

**B. Use the API directly** to append the matching operation handler (for handlers that exist in the backend registry but don't have a UI form yet). See the API reference below.

After publishing the new version:

1. The publish modal shows the new version number and the exact config pin to update, for example `organisms.<key>.configVersion=<new-version>`.
2. Update the values file or Helm override that your deployment uses. For GitOps/ArgoCD deployments, commit and push the values change. For direct Helm deployments, run the `helm upgrade` command shown in the modal after replacing the release and chart placeholders.
3. This rolls the per-organism SILO and LAPIS Deployments. The `config-adapter` init container on each new pod fetches the new pinned version from the backend and re-renders `database_config.yaml` / `reference_genomes.json` / `preprocessing_config.yaml`. SILO then re-imports the data.
4. Once SILO is healthy on the new version, the change is live.

While SILO is re-importing, queries hit the previous version's data on the still-running pod (Kubernetes does a rolling update). There's no manual downtime, but expect a brief period where the new SILO pod is in `Init` waiting on the adapter + the re-import.

### Tracking what changed

The **History** page for the organism (`/admin/config/organisms/<key>/history`) lists every published version + every audit-log entry (who applied which operation, when). The top-level **Audit** page does the same across all scopes.

Each version's stored config is browsable via the API: `GET /api/config/organisms/<key>?version=N`. The **View JSON** page in the dashboard shows the currently-published version and the current draft (if any).

## API reference (for scripting + advanced cases)

For situations where the admin dashboard doesn't yet have a form — or when you want to script bulk changes — the same operations are available via HTTP.

### Get an access token

```bash
KEYCLOAK_URL="http://localhost:8083"

ACCESS_TOKEN=$(
  curl --fail-with-body -sS \
    -H "Content-Type: application/x-www-form-urlencoded" \
    -d "username=loculus_administrator" \
    -d "password=loculus_administrator" \
    -d "grant_type=password" \
    -d "client_id=backend-client" \
    "$KEYCLOAK_URL/realms/loculus/protocol/openid-connect/token" \
  | jq -r ".access_token"
)
```

The user must have the `loculus_administrator` realm role.

### Public read API (no auth)

| Endpoint                                      | Purpose                                                                         |
| --------------------------------------------- | ------------------------------------------------------------------------------- |
| `GET /api/config/instance[?version=N]`        | Latest instance config, or a pinned version. Includes top-level `readOnlyMode`. |
| `GET /api/config/organisms`                   | List released and deployed organisms with their current versions.               |
| `GET /api/config/organisms/{key}[?version=N]` | One organism's config, latest or pinned.                                        |

### Admin write API (`Bearer` loculus_administrator token)

| Endpoint                                                  | Purpose                                                                                                      |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `GET /api/admin/config/organisms`                         | List all organisms including unreleased and not-deployed organisms.                                          |
| `POST /api/admin/config/organisms` `{key}`                | Create a new unreleased organism.                                                                            |
| `GET /api/admin/config/organisms/{key}/draft`             | Get the current draft (204 if none).                                                                         |
| `PUT /api/admin/config/organisms/{key}/draft`             | **Unreleased only.** Replace the full draft document. Use `If-Match: <revision>` for optimistic concurrency. |
| `POST /api/admin/config/organisms/{key}/draft/operations` | **Released only.** Append operation(s); body `{operations: [{type, payload}]}`.                              |
| `DELETE /api/admin/config/organisms/{key}/draft`          | Discard the draft.                                                                                           |
| `POST /api/admin/config/organisms/{key}/publish`          | Publish the draft as a new immutable version.                                                                |
| `POST /api/admin/config/organisms/{key}/mark-deployed`    | Mark a released organism deployed after SILO/LAPIS have been rolled out and checked.                         |
| `GET /api/admin/config/organisms/{key}/versions`          | List versions of one organism.                                                                               |
| `GET /api/admin/config/instance/draft`                    | Get the current instance draft (204 if none).                                                                |
| `PUT /api/admin/config/instance/draft`                    | Replace the full instance draft document.                                                                    |
| `POST /api/admin/config/instance/draft/operations`        | Append operation(s).                                                                                         |
| `POST /api/admin/config/instance/publish`                 | Publish the instance draft.                                                                                  |
| `GET /api/admin/config/audit[?organism=<key>]`            | Audit log entries (filter by organism or all).                                                               |

### End-to-end script: create + publish a new organism

```bash
BACKEND_URL="http://localhost:8079"
ORGANISM="example-virus"

# 1. Create row.
curl --fail-with-body -sS \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"key\":\"$ORGANISM\"}" \
  "$BACKEND_URL/api/admin/config/organisms"

# 2. Put the full draft (config in a file).
curl --fail-with-body -sS -X PUT \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d @organism-config.json \
  "$BACKEND_URL/api/admin/config/organisms/$ORGANISM/draft"

# 3. Publish v1.
curl --fail-with-body -sS -X POST \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  "$BACKEND_URL/api/admin/config/organisms/$ORGANISM/publish"
```

`organism-config.json` is the same shape the admin dashboard's document editor shows, wrapped in `{"config": ...}`:

```json
{
  "config": {
    "schema": { "organismName": "Example virus", "metadata": [] },
    "referenceGenome": { "nucleotideSequences": [], "genes": [] }
  }
}
```

### Append an operation

```bash
curl --fail-with-body -sS -X POST \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "operations": [
      {
        "type": "setOrganismDisplay",
        "payload": {"displayName": "Example virus", "description": "..." }
      }
    ]
  }' \
  "$BACKEND_URL/api/admin/config/organisms/$ORGANISM/draft/operations"
```

The exact operation types currently in the registry: `setInstanceBranding`, `setMetadataFieldDisplay`, `setOrganismDisplay`, `reorderMetadataFields`, `addLinkOut`, `updateLinkOut`, `removeLinkOut`, `addOptionalMetadataField`. The Swagger UI at `/swagger-ui/index.html` is the authoritative reference for the current schema.

### Bulk load fixtures

The `loculus-config-loader` CLI (in `config-tools/`) reads a directory of fixture YAMLs (`instance.yaml` + `organisms/*.yaml`) and posts them via the admin API. Useful for bootstrapping a fresh instance or restoring config from version control.

```bash
cd config-tools
npm install
npm run loader -- \
  --backend-url http://localhost:8079 \
  --fixtures ../kubernetes/loculus/fixtures \
  --admin-token "$ACCESS_TOKEN"
```

Modes: `idempotent` (default, skip exact matches), `fresh-only` (fail if anything already exists; used by the Helm post-install Job). See `config-tools/README.md` for full usage.
