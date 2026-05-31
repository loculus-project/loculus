---
title: Local development instance
description: How to spin up a feature-complete local Loculus instance, matching the dev/preview environments
---

This guide walks you through standing up a Loculus instance on your own machine that matches the functionality of the dev and preview environments: same default organisms, automatic INSDC ingest, full preprocessing pipelines, and the new DB-backed config system seeded from `kubernetes/loculus/fixtures/`.

There are two flavours of local dev, depending on what you're modifying:

- **All-in-cluster** — every component runs in k3d, you use the published `ghcr.io/loculus-project/*` images. Closest to the preview environment. Right for trying things end-to-end without writing code.
- **`--dev` (IDE) mode** — Postgres + Keycloak + SILO + LAPIS + preprocessing + ingest run in k3d; **backend and website run on your host in your IDE**. Right when you're modifying backend or website code, since rebuild + restart is instant.

Both flavours can run entirely offline once images are local — there's a section on building all images locally below.

> If you're new to Loculus and just want a minimal "hello world" tutorial, start with [My first Loculus](../my-first-loculus). Come back here when you want a full-fidelity local instance.

## What you'll get

- All 8 default organisms (`cchf`, `cchf-multi-ref`, `dummy-organism`, `dummy-organism-with-files`, `ebola-sudan`, `enteroviruses`, `not-aligned-organism`, `west-nile`), seeded from `kubernetes/loculus/fixtures/` via the `loculus-config-loader`.
- The Nextclade-based preprocessing pipeline running for each organism.
- The INSDC ingest pipeline running against NCBI Datasets.
- SILO + LAPIS pods per organism, with their config rendered by the `loculus-config-adapter` init container fetching from the backend.
- Keycloak with pre-seeded test accounts, including `superuser` (password `superuser`) for curation workflows and `loculus_administrator` (password `loculus_administrator`) for the admin dashboard.

## System requirements

- Linux or macOS with Docker support. Tested on Ubuntu 24.04 and macOS 14.
- At least 8 GB RAM and 4 CPU cores free for the cluster (preprocessing + ingest are memory-hungry).
- ~20 GB free disk space (Docker images + SILO data dirs).

## 1. Install prerequisites

| Tool | Why | Install |
|---|---|---|
| Docker | k3d runs Kubernetes inside Docker | <https://docs.docker.com/get-started/get-docker/> |
| k3d | Lightweight Kubernetes-in-Docker | `curl -s https://raw.githubusercontent.com/k3d-io/k3d/main/install.sh \| bash` |
| kubectl | Cluster CLI | <https://kubernetes.io/docs/tasks/tools/> |
| Helm | Chart deployer | <https://helm.sh/docs/intro/install/> |
| Python 3.9+ with `pyyaml` | `./deploy.py` wrapper | `pip install pyyaml` |
| Node 22+, npm | For `config-tools/` (loader CLI), and optionally for running the website in your IDE | <https://nodejs.org/> |
| Java 21+, Gradle | For running the backend in your IDE | <https://adoptium.net/> |

## 2. Clone the repo

```bash
git clone https://github.com/loculus-project/loculus.git
cd loculus
```

All subsequent commands assume you're in the repo root.

## Flavour A — `--dev` (IDE) mode

This is the workflow when you're actively modifying backend or website code. The cluster runs everything else; the backend + website you're working on run on your host in your IDE and pick up changes on rebuild.

### A.1 Create the cluster (no backend/website port-forwards)

```bash
./deploy.py --verbose cluster --dev
```

`--dev` removes the port-forwards for 3000 (website) and 8079 (backend) so those host ports are free for your IDE-run servers. Postgres (5432), Keycloak (8083), LAPIS (8080), and S3 (8084) are still forwarded, so the IDE-run backend can reach them.

### A.2 Deploy the in-cluster stack

```bash
./deploy.py --verbose helm \
  --branch latest \
  --dev \
  --enablePreprocessing \
  --enableIngest
```

What the flags do:

- `--branch latest` — uses the `:latest` tag for each image (built from `main`).
- `--dev` — sets `disableBackend=true` and `disableWebsite=true`, plus pulls in `kubernetes/loculus/values_e2e_and_dev.yaml` (test accounts, deterministic raw passwords, debug flags).
- `--enablePreprocessing` / `--enableIngest` — turn on the preprocessing + ingest deployments (off by default; needed to match preview functionality).

In `--dev` mode the chart **skips the `loculus-config-loader` Job entirely** — it would race the IDE backend startup. You'll run the loader manually in step A.4.

### A.3 Start backend + website in your IDE

The backend needs Postgres + Keycloak from the cluster. The repo ships `backend/start_dev.sh` which already points at `localhost:5432` (Postgres) and `localhost:8083` (Keycloak) — those are the k3d port-forwards:

```bash
cd backend && ./start_dev.sh
```

(Or run `org.loculus.backend.BackendApplication` from your IDE with the equivalent `--spring.*` args — see the script.)

Once the backend is up at <http://localhost:8079>, start the website. From `website/`:

```bash
../generate_local_test_config.sh   # writes website/tests/config/{runtime,website,backend}_config.json
npm install                        # one-time
CONFIG_DIR=$(pwd)/tests/config npm run dev
```

The website is then at <http://localhost:3000>.

### A.4 Seed organisms via the loader CLI

The cluster's Helm Job didn't run (intentional, see A.2). Run the loader from your host once the IDE backend is up:

```bash
cd config-tools
npm install  # one-time

TOKEN=$(curl -sS \
  -d "username=loculus_administrator&password=loculus_administrator&grant_type=password&client_id=backend-client" \
  http://localhost:8083/realms/loculus/protocol/openid-connect/token \
  | python3 -c "import sys,json;print(json.load(sys.stdin)['access_token'])")

npm run loader -- \
  --backend-url http://localhost:8079 \
  --fixtures ../kubernetes/loculus/fixtures \
  --admin-token "$TOKEN"
```

The default mode is `idempotent`, so the command is safe to re-run after editing fixtures. It will skip exact matches and fail loudly on drift.

Expected output ends with:

```text
Instance: published-new-version (v2)
Organisms created: 8
```

After this completes, the SILO/LAPIS pods (which until now were sitting in `Init` waiting on `/api/config/organisms`) will unblock automatically: each pod's `config-adapter` init container retries the fetch on a short interval, and once the organism config is reachable on the IDE backend at `host.k3d.internal:8079`, it writes `database_config.yaml` etc. and SILO + LAPIS start.

### A.5 Check the website and admin dashboard

- Public site: <http://localhost:3000> — all 8 organisms appear in the dropdown.
- Admin dashboard: <http://localhost:3000/admin/config/> — log in as `loculus_administrator` / `loculus_administrator`. See [Managing configuration](../managing-configuration) for the full walkthrough.

Preprocessing + ingest pods run automatically; expect the first ingested batches to appear under e.g. <http://localhost:3000/ebola-sudan> after 5-10 minutes.

### A.6 Iterate

- **Backend code changes:** stop `start_dev.sh`, save your edit, restart. The cluster components automatically reconnect to the new backend instance.
- **Website code changes:** `npm run dev` is hot-reload; just save.
- **Fixture changes:** re-run the loader (step A.4). Idempotent mode skips unchanged organisms and fails on drift — to push drifted fixtures, manually delete the affected organism via the admin UI first (or accept that breaking changes need the clone-and-replace workflow described in [Managing configuration §3](../managing-configuration#3-update-an-organism)).

## Flavour B — all-in-cluster

Use this when you just want a working full instance without touching code.

### B.1 Create the cluster (with backend + website port-forwards)

```bash
./deploy.py --verbose cluster
```

### B.2 Deploy

```bash
./deploy.py --verbose helm \
  --branch latest \
  --for-e2e \
  --enablePreprocessing \
  --enableIngest
```

`--for-e2e` applies `kubernetes/loculus/values_e2e_and_dev.yaml` (test accounts + deterministic service-account passwords needed by the loader Job + debug flags), without setting `disableBackend`. The post-install loader Job runs automatically and seeds the 8 organisms.

### B.3 Wait and open

```bash
kubectl get pods
```

When everything is `Running` (or `Completed` for the loader Job), open <http://localhost:3000>. Log in to the admin dashboard as `loculus_administrator` / `loculus_administrator`.

Pod readiness order: Postgres → Keycloak (~1-2 minutes; everything else crash-loops while waiting) → backend (runs Flyway including the V2.0 `config_*` migration) → `loculus-config-loader-<hash>` Job (completes in ~10s once backend is ready) → SILO/LAPIS init containers unblock → website ready.

## Run entirely from local builds (offline / unpushed-changes)

By default `./deploy.py helm --branch latest` pulls images from `ghcr.io/loculus-project/*:latest` — the images CI built from `main`. If you want to run a fully local instance with unpushed changes (or just offline), build the images locally, import them into k3d, and tell Helm to use the `local` tag.

### Build + import

```bash
# Flavour A (--dev): build everything except backend + website (you run those in IDE).
./build-local-images.sh --dev

# Flavour B (all-in-cluster): build everything.
./build-local-images.sh
```

The script tags every image as `ghcr.io/loculus-project/<component>:local` and `k3d image import`s it into the `testCluster` cluster. Re-run for any single component as needed:

```bash
./build-local-images.sh config-adapter
./build-local-images.sh preprocessing-nextclade ingest
```

(See `./build-local-images.sh --help` for the full component list.)

The only image still pulled from a remote registry is `ghcr.io/genspectrum/lapis` (upstream LAPIS) — k3d pulls it once and caches.

### Deploy with the `local` tag

```bash
# Flavour A (--dev)
./deploy.py --verbose helm --branch local --dev --enablePreprocessing --enableIngest

# Flavour B
./deploy.py --verbose helm --branch local --for-e2e --enablePreprocessing --enableIngest
```

Two things happen automatically when `--branch local` is detected:

1. The chart's docker-tag helper resolves `--branch local` to the literal `local` tag, so every container references the image you just built (e.g. `ghcr.io/loculus-project/config-adapter:local`).
2. `deploy.py` applies `kubernetes/loculus/values_local_images.yaml` on top of the chart, which switches `imagePullPolicy` for every Loculus-built image from `Always` to `IfNotPresent`. **This is critical** — without it kubelet still tries to pull `:local` from ghcr.io (because `Always` means always), gets a 403 ("anonymous token, status 403"), and the pod stays in `ImagePullBackOff` forever even though the image is already in containerd.

If you ever see `Failed to pull image "ghcr.io/loculus-project/<...>:<...>": ... 403 Forbidden`, the fix is either:

- You deployed without `--branch local` (the default `--branch latest` references the public ghcr.io `:latest` tag, which only exists once CI has pushed it). Rebuild + redeploy: `./build-local-images.sh --dev && ./deploy.py helm --branch local --dev --enablePreprocessing --enableIngest`.
- The image isn't in containerd yet — rerun `./build-local-images.sh <component>`.

### After editing one component

You don't have to rebuild everything. The two-step pattern is:

```bash
./build-local-images.sh <component>           # rebuild + reimport one image
kubectl rollout restart deploy/loculus-<...>  # restart the matching deployment
```

For per-organism components (e.g. `loculus-preprocessing-ebola-sudan-v1-0`) you'll need to restart each affected deployment, or `helm upgrade` to roll all of them.

## Customising the instance

### Add or modify an organism

The DB-backed config is the source of truth. Use the admin dashboard at <http://localhost:3000/admin/config/organisms> — see [Managing configuration §2-3](../managing-configuration#2-create-and-launch-a-new-organism).

For SILO/LAPIS to spin up a per-organism pod for a brand-new organism, you also need to add it to `kubernetes/loculus/values.yaml` under `defaultOrganisms` (so the chart templates the pods) and `helm upgrade`. The website picks up new organisms automatically on the next page load.

### Re-seed config from fixtures

After editing `kubernetes/loculus/fixtures/`:

```bash
cd config-tools
npm run loader -- \
  --backend-url http://localhost:8079 \
  --fixtures ../kubernetes/loculus/fixtures \
  --admin-token "$TOKEN"
```

Default mode is `idempotent`. To wipe and start clean, delete the relevant organism rows via the admin UI first (or in Flavour B, `./deploy.py helm --uninstall` + start over).

### Reset just the data (keep config)

```bash
kubectl exec deployment/loculus-database -- \
  psql -U postgres -d loculus -c "TRUNCATE sequence_entries CASCADE;"
```

## Common issues

### `--dev`: SILO/LAPIS pod stuck in `Init`

Cause: the `config-adapter` init container can't reach `/api/config/organisms/<key>?version=1`. In `--dev` mode this almost always means either (a) the IDE backend isn't running, or (b) the loader hasn't been run yet (A.4).

```bash
kubectl logs <silo-pod-name> -c config-adapter-<key>
```

### Loader fails with "organism already exists"

The loader's default mode (`idempotent`) won't overwrite drifted released organisms. Two paths:

- Edit the fixture YAML to match the released config (so it's a no-op skip).
- Delete the affected organism via the admin dashboard and re-run the loader.

### Loader Job in Flavour B fails

Check `kubectl logs job/loculus-config-loader`. Most common cause: Keycloak wasn't ready when the Job ran. Delete the Job and reapply:

```bash
kubectl delete job loculus-config-loader
./deploy.py --verbose helm --branch latest --for-e2e --enablePreprocessing --enableIngest
```

### Port 5432 already in use

You probably have a local Postgres running on 5432. Stop it, or edit `./deploy.py` to map a different host port.

### Keycloak slow start

Keycloak takes 1-2 minutes to start. Dependent pods crash-loop until it's ready, then automatically recover. No action needed.

### Ingest pulls nothing

The INSDC ingest pipeline polls NCBI Datasets, which is slow at startup (downloads reference datasets first). Logs show progress.

## Reference

- `./deploy.py --help` — full deploy script options.
- `./build-local-images.sh --help` — local-image build script.
- `kubernetes/loculus/values.yaml` — per-organism scaffolding (configVersion, preprocessing + ingest pipeline declarations, replicas).
- `kubernetes/loculus/fixtures/` — canonical DB-backed config (the source of truth the loader posts; matches what the admin dashboard edits).
- `kubernetes/loculus/values_e2e_and_dev.yaml` — overrides applied by `--for-e2e` and `--dev` (test accounts, raw service-account passwords incl. `configLoaderUserPassword`, debug flags).
- `config-tools/README.md` — loader/adapter CLI usage.
- [Configuration system](../configuration-system) — concepts; and [Managing configuration](../managing-configuration) — the full admin guide.
