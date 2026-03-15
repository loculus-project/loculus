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

# Create values file to use host.k3d.internal (see note below)
echo 'localHost: host.k3d.internal' > /tmp/k3d-values.yaml

# Deploy with Helm
SHA=$(git rev-parse HEAD | cut -c1-7)
./deploy.py --verbose helm --branch main --sha $SHA --for-e2e --enablePreprocessing --values /tmp/k3d-values.yaml

# Add host entry so the browser can resolve host.k3d.internal
# (requires sudo - add this line to /etc/hosts)
echo '127.0.0.1 host.k3d.internal' | sudo tee -a /etc/hosts
```

> **Why `host.k3d.internal`?** Services like MinIO generate pre-signed URLs that both browsers and internal pods need to access. Using `host.k3d.internal` works because:
> - From inside pods: k3d automatically configures DNS to resolve this to the host machine
> - From the browser: The `/etc/hosts` entry points to `127.0.0.1` where ports are forwarded
>
> The `--use-localhost-ip` flag uses your machine's actual IP (e.g., `192.168.x.x`), which often isn't routable from inside Docker containers, causing S3 connectivity failures.

### 2. Install dependencies

```sh
# Install Node.js dependencies
cd integration-tests && npm ci

# Install Python CLI
cd ../cli && uv sync && uv build && uv pip install --system dist/*.whl

# Install keyring backend for CLI
uv pip install --system keyrings.alt

# Install Playwright browsers
cd ../integration-tests && npx playwright install --with-deps
```

### 3. Wait for pods to be ready

```sh
# Wait for all pods to be ready (from repository root)
./.github/scripts/wait_for_pods_to_be_ready.py --timeout 600

# Give services time to fully initialize
sleep 10
```

### 4. Run the tests

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

Using `host.k3d.internal` for the test URL will cause Keycloak authentication failures with "Invalid redirect URI" errors.

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

## Troubleshooting k3d Setup

**Pods can't reach S3/MinIO (connection timeouts to host IP):**
- Ensure you deployed with `localHost: host.k3d.internal` in your values file
- Verify the config: `kubectl get deployment loculus-backend -o yaml | grep S3_BUCKET_ENDPOINT`
- Should show `http://host.k3d.internal:8084`, not your machine's IP

**Browser can't connect to services:**
- Ensure `/etc/hosts` contains `127.0.0.1 host.k3d.internal`
- Test with: `curl http://host.k3d.internal:3000`

**Tests timeout waiting for sequence processing:**
- Check preprocessing pod logs (see Debugging Sequence Processing below)
- Verify all pods are running: `kubectl get pods`

**Python version issues with deploy.py:**
- The `deploy.py` script requires Python 3.9+
- If anaconda shadows system python, use `/usr/bin/python3 ./deploy.py` instead

**Cleanup:**
```sh
k3d cluster delete testCluster
```

## Debugging Sequence Processing

When sequences are stuck in "awaiting processing" state:

### 1. Find the correct preprocessing pod

Preprocessing pods are named by organism and version:
```sh
# List all preprocessing deployments
kubectl get deployments | grep preprocessing

# Example output:
# loculus-preprocessing-dummy-organism-v2-0
# loculus-preprocessing-ebola-sudan-v1-0
```

### 2. Check preprocessing logs

```sh
# Get pod name for a specific organism (e.g., dummy-organism)
kubectl get pods | grep preprocessing-dummy-organism

# Check logs for errors
kubectl logs <pod-name> --tail=100

# Or stream logs in real-time
kubectl logs -f <pod-name>
```

### 3. Common preprocessing errors

**422 "Unknown genes" error:**
```
Exception: ('Submitting processed data failed. Status code: 422',
'{"detail":"Unknown genes in \'alignedAminoAcidSequences\': E."}')
```
This means the preprocessing is submitting amino acid sequences for genes that aren't defined in the organism's `referenceGenomes` config in `values.yaml`. Check that gene names in `mock-sequences.json` (for dummy preprocessing) match gene names in `kubernetes/loculus/values.yaml`.

**304 responses (no sequences to process):**
If logs show repeated `HTTP/1.1" 304 0` responses, it means:
- Either there are no new sequences to process
- Or sequences are stuck in `IN_PROCESSING` status from a previous failed attempt

### 4. Check backend for stuck sequences

```sh
# Port-forward to the database
kubectl port-forward svc/loculus-database-service 5432:5432

# In another terminal, connect and check sequence status
PGPASSWORD=loculus psql -h localhost -U loculus -d loculus -c \
  "SELECT accession, version, status FROM sequence_entries WHERE organism='dummy-organism' ORDER BY accession DESC LIMIT 10;"
```

### 5. Applying config changes

After editing `kubernetes/loculus/values.yaml`, apply changes with helm upgrade:
```sh
# Using reuse-values to keep existing settings
helm upgrade preview ./kubernetes/loculus --reuse-values --wait

# Or redeploy fully (requires Python 3.9+)
SHA=$(git rev-parse HEAD | cut -c1-7)
/usr/bin/python3 ./deploy.py helm --branch main --sha $SHA --for-e2e --enablePreprocessing --values /tmp/k3d-values.yaml
```

After helm upgrade, restart affected deployments:
```sh
kubectl rollout restart deployment/loculus-backend
kubectl rollout restart deployment/loculus-preprocessing-dummy-organism-v2-0
```

## Checklist before committing code

Run `npm run format` to ensure proper formatting and linting before committing.
