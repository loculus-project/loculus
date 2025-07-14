# Loculus CLI

A command-line interface for interacting with Loculus, a platform for pathogen sequence submission and retrieval.

## Installation

```bash
poetry install
```


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
