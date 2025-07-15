# Loculus CLI

A command-line interface for interacting with Loculus. The CLI is currently an unstable work in progress.

## Installation

### Prerequisites

- Python 3.10 or higher
- pip (Python package manager)

### Install from source

```bash
# Clone the repository
git clone https://github.com/loculus-project/loculus.git
cd loculus/cli

# Option 1: Install using uv (recommended)
# First install uv if you haven't already
curl -LsSf https://astral.sh/uv/install.sh | sh

# Create virtual environment and install dependencies
uv sync

# Install the CLI
uv pip install -e .

# Option 2: Install using pip
# Create a virtual environment (recommended)
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install the package in development mode
pip install -e .
```

### Verify installation

```bash
loculus --help
```

## Usage

### Basic Command Structure

```bash
loculus [GLOBAL OPTIONS] COMMAND [COMMAND OPTIONS]
```

### Global Options

- `--instance TEXT`: Loculus instance URL (e.g., main.loculus.org)
- `-o, --organism TEXT`: Organism name (e.g., 'Mpox', 'H5N1')
- `-g, --group INTEGER`: Group ID for operations
- `--config TEXT`: Path to configuration file
- `-v, --verbose`: Enable verbose output
- `--no-color`: Disable colored output

### Available Commands

- `auth`: Authentication commands
- `config`: Configuration management
- `get`: Search and retrieve sequences
- `group`: Manage groups
- `instance`: Manage Loculus instances
- `organism`: Manage organisms
- `release`: Release sequences for public access
- `schema`: Schema discovery
- `status`: Show status of submitted sequences
- `submit`: Submit sequences



## Development

```bash
# Install in development mode
pip install -e .

# Run tests
pytest

# Run linting
uv run ruff check .
uv run black --check .
uv run mypy .

# Format code
uv run black .
uv run ruff check . --fix

# Integration tests (from the integration-tests directory)
cd ../integration-tests
npx playwright test --project=cli-tests
```

## Testing

The CLI includes comprehensive integration tests that run alongside the existing Playwright test suite. These tests verify:

- Authentication flows
- Sequence submission and validation
- Search and retrieval operations
- Configuration management
- Error handling

To run only the CLI tests:

```bash
cd integration-tests
npx playwright test --project=cli-tests --reporter=line

 PLAYWRIGHT_TEST_BASE_URL=https://cli.loculus.org npx playwright test --project=cli-tests                │
│   --reporter=line        
```

(we should often run against cli.loculus.org)
