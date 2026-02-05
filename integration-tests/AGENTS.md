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

# Deploy with Helm (use main branch to avoid image pull issues)
./deploy.py --verbose helm --branch main --for-e2e --enablePreprocessing --use-localhost-ip
```

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

## Checklist before committing code

Run `npm run format` to ensure proper formatting and linting before committing.
