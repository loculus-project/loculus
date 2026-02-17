# Integration Tests

## Running Against Local k3d

**Note:** Running against local k3d requires Docker to be installed and running. If Docker is not available, use the [Remote Environments](#running-against-remote-environments) approach instead.

To run integration tests against a local k3d cluster (following the GitHub workflow approach):

### Prerequisites

Install required tools if not already installed:

```sh
# Ensure Docker is installed and running
# See https://docs.docker.com/get-docker/
docker --version

# Install k3d (Kubernetes in Docker)
curl -s https://raw.githubusercontent.com/k3d-io/k3d/main/install.sh | bash
k3d version

# Install Helm
# See https://helm.sh/docs/intro/install/ for installation instructions
# Or use the GitHub Actions version:
curl https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-3 | bash
helm version

# Install uv (Python package manager)
# See https://docs.astral.sh/uv/getting-started/installation/
curl -LsSf https://astral.sh/uv/install.sh | sh

# Install Node.js and npm (if not already installed)
# The project uses the version specified in website/.nvmrc
# Consider using nvm: https://github.com/nvm-sh/nvm
node --version
npm --version
```

### 1. Set up the k3d cluster

```sh
# Create k3d cluster with port bindings
./deploy.py --verbose cluster --bind-all

# Create values file to use host.k3d.internal
echo 'localHost: host.k3d.internal' > /tmp/k3d-values.yaml

# Deploy with Helm
SHA=$(git rev-parse HEAD | cut -c1-7)
./deploy.py --verbose helm --branch main --sha $SHA --for-e2e --enablePreprocessing --values /tmp/k3d-values.yaml

# Add host entry so the browser can resolve host.k3d.internal
# (requires sudo - add this line to /etc/hosts if not already present)
grep -q 'host.k3d.internal' /etc/hosts || echo '127.0.0.1 host.k3d.internal' | sudo tee -a /etc/hosts
```

> **Why `host.k3d.internal`?** Services like MinIO generate pre-signed URLs that both browsers and internal pods need to access. Using `host.k3d.internal` works because:
> - From the browser: The `/etc/hosts` entry points to `127.0.0.1` where ports are forwarded
> - From inside pods: After the DNS fix below, it resolves to the MinIO service ClusterIP

> **Python version note:** If anaconda shadows system python, use `/usr/bin/python3 ./deploy.py` instead.

> **Disk pressure note:** If disk usage is above ~85%, k3d nodes get `DiskPressure` taint and pods stay `Pending`. Free up disk space or add `--k3s-arg '--kubelet-arg=eviction-hard=imagefs.available<1%,nodefs.available<1%@server:*' --k3s-arg '--kubelet-arg=eviction-hard=imagefs.available<1%,nodefs.available<1%@agent:*'` to the `k3d cluster create` command.

### 2. Fix DNS for pods (critical)

By default, `host.k3d.internal` resolves to the Docker gateway IP inside pods, but host ports (8084 for MinIO, etc.) aren't accessible from that route. This causes preprocessing pods to fail with `ConnectionError` when trying to use pre-signed S3 URLs.

Fix by overriding CoreDNS to point `host.k3d.internal` to the MinIO service ClusterIP:

```sh
MINIO_IP=$(kubectl get svc loculus-minio-service -o jsonpath='{.spec.clusterIP}')
kubectl patch configmap coredns -n kube-system --type=json \
  -p="[{\"op\":\"replace\",\"path\":\"/data/NodeHosts\",\"value\":\"${MINIO_IP} host.k3d.internal\n$(kubectl get configmap coredns -n kube-system -o jsonpath='{.data.NodeHosts}' | grep -v host.k3d.internal)\"}]"
kubectl rollout restart deployment coredns -n kube-system
sleep 10

# Restart preprocessing pods to pick up DNS change
kubectl get deployments | grep preprocessing | awk '{print $1}' | xargs -I {} kubectl rollout restart deployment {}
```

### 3. Install dependencies

```sh
# Install Node.js dependencies
cd integration-tests && npm ci

# Install Python CLI (use the venv, not --system, to avoid permission issues)
cd ../cli && uv sync && uv build

# Install keyring backend for CLI tests
uv pip install --python .venv/bin/python keyrings.alt

# Make the CLI available on PATH
mkdir -p ~/bin && ln -sf $(pwd)/.venv/bin/loculus ~/bin/loculus
export PATH="$HOME/bin:$PATH"

# Install Playwright browsers (use --with-deps if you have sudo, otherwise just the browser)
cd ../integration-tests && npx playwright install chromium
# Or with system deps: npx playwright install --with-deps
```

### 4. Wait for pods to be ready

```sh
# Wait for all pods to be ready (from repository root)
./.github/scripts/wait_for_pods_to_be_ready.py --timeout 600

# Give services time to fully initialize
sleep 10
```

### 5. Run the tests

```sh
cd integration-tests

# Run all tests with Chromium
BROWSER=chromium npx playwright test --workers=4 --reporter=list

# Run specific test file
npx playwright test tests/specs/cli/auth.spec.ts --reporter=list

# Run with Firefox instead
BROWSER=firefox npx playwright test --workers=4 --reporter=list
```

**Important:** Do NOT set `PLAYWRIGHT_TEST_BASE_URL=http://host.k3d.internal:3000` when running tests against local k3d. The default `localhost:3000` works correctly because:
- Ports are forwarded from k3d to localhost
- Keycloak is configured to allow redirects to `localhost:3000`, not `host.k3d.internal:3000`

#### Controlling Test Execution

Test execution can be controlled using the `BROWSER` and `TEST_SUITE` environment variables.

-   `BROWSER`: Specifies the browser for *browser-based* tests (`chromium`, `firefox`). If not set, browser-based tests run on all configured browsers. Note that CLI tests always run on Chromium, regardless of this setting.
-   `TEST_SUITE`: Filters tests by suite:
    -   `all` (default): Runs both browser and CLI tests.
    -   `browser`: Runs only browser-based tests.
    -   `cli`: Runs only CLI tests (always on Chromium).


## Running Against Remote Environments

```sh
# Run tests against main deployment
PLAYWRIGHT_TEST_BASE_URL=https://main.loculus.org npx playwright test --reporter=list

# Run tests against a specific preview environment
PLAYWRIGHT_TEST_BASE_URL=https://preview-123.loculus.org npx playwright test --reporter=list
```

## Troubleshooting

**Preprocessing pods crash-loop with `ConnectionError` to `host.k3d.internal:8084`:**
- You need the DNS fix from step 2 above. The pre-signed S3 URLs contain `host.k3d.internal:8084` which isn't reachable from pods by default.

**CLI tests fail with `No module named 'keyring'`:**
- Install `keyrings.alt` in the CLI venv: `uv pip install --python cli/.venv/bin/python keyrings.alt`

**CLI tests fail with `loculus: command not found`:**
- Ensure the CLI is on PATH: `ln -sf $(pwd)/cli/.venv/bin/loculus ~/bin/loculus && export PATH="$HOME/bin:$PATH"`

**`deploy.py` fails with "Python 3.9 or higher is required":**
- Anaconda Python is too old. Use: `/usr/bin/python3 ./deploy.py`

**Pods stuck in `Pending` with `DiskPressure` taint:**
- Free disk space below 85% usage, or recreate cluster with relaxed eviction thresholds (see step 1 notes).

**Cleanup:**
```sh
k3d cluster delete testCluster
```

## Checklist before committing code

Run `npm run format` to ensure proper formatting and linting before committing.
