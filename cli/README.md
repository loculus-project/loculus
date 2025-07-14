# Loculus CLI

A command-line interface for interacting with Loculus, a platform for pathogen sequence submission and retrieval.

## Installation

```bash
pip install -e .
```

## Quick Start

```bash
# Configure the CLI
loculus config set default_instance main.loculus.org

# Login
loculus auth login

# Submit sequences
loculus submit sequences --metadata metadata.tsv --sequences sequences.fasta --organism "Mpox"

# Get sequences
loculus get sequences --organism "Mpox" --limit 10

# Get sequences and save to file
loculus get sequences --organism "Mpox" --format fasta --output sequences.fasta
```

## Commands

### Authentication
- `loculus auth login` - Login to Loculus
- `loculus auth logout` - Logout and clear stored credentials
- `loculus auth status` - Show current authentication status

### Submission
- `loculus submit sequences` - Submit sequences with metadata
- `loculus submit validate` - Validate files before submission
- `loculus submit template` - Generate metadata template

### Retrieval
- `loculus get sequences` - Search and retrieve sequences
- `loculus get details` - Get detailed sequence information
- `loculus get stats` - Get aggregated statistics
- `loculus get all` - Download all released data

### Revision
- `loculus revise sequence` - Revise an existing sequence
- `loculus revise batch` - Batch revise multiple sequences

### Configuration
- `loculus config set` - Set configuration values
- `loculus config get` - Get configuration values  
- `loculus config list` - List all configuration

## Configuration

The CLI can be configured through:
1. Command-line arguments
2. Environment variables (prefixed with `LOCULUS_`)
3. Configuration files (`~/.config/loculus/config.yml`)

## Development

```bash
# Install in development mode
pip install -e .

# Run tests
pytest

# Run linting
poetry run ruff check .
poetry run black --check .
poetry run mypy .

# Format code
poetry run black .
poetry run ruff check . --fix

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
