# Loculus CLI Developer Documentation

This document provides a comprehensive guide for developers working on the Loculus CLI project.

## Architecture Overview

The Loculus CLI is built using Python with the following key components:

- **Click**: Command-line interface framework
- **Rich**: Terminal formatting and output
- **httpx**: HTTP client for API requests
- **Pydantic**: Data validation and models
- **keyring**: Secure credential storage

### Project Structure

```
cli/
├── src/loculus_cli/
│   ├── __init__.py
│   ├── cli.py              # Main CLI entry point
│   ├── config.py           # Configuration management
│   ├── instance_info.py    # Dynamic instance discovery
│   ├── api/
│   │   ├── backend.py      # Backend API client
│   │   ├── lapis.py        # LAPIS API client
│   │   └── models.py       # Pydantic data models
│   ├── auth/
│   │   └── client.py       # Keycloak authentication
│   ├── commands/
│   │   ├── auth.py         # Authentication commands
│   │   ├── config.py       # Configuration commands
│   │   ├── get.py          # Search/retrieve commands
│   │   ├── schema.py       # Schema discovery commands
│   │   ├── submit.py       # Submission commands
│   │   └── revise.py       # Revision commands
│   └── utils/
│       └── metadata_filter.py  # Schema-aware filtering
├── pyproject.toml          # Poetry configuration
└── tests/                  # Unit tests
```

## Development Setup

### Prerequisites

- Python 3.9+ 
- Poetry for dependency management

### Installation

```bash
# Clone the repository
git clone <repo-url>
cd loculus/cli

# Install dependencies
poetry install

# Run the CLI
poetry run loculus --help
```

### Running Tests

```bash
# Unit tests
poetry run pytest

# Integration tests (from integration-tests directory)
cd ../integration-tests
PLAYWRIGHT_TEST_BASE_URL=https://cli.loculus.org npx playwright test --project=cli-tests
```

## Key Concepts

### Dynamic Configuration

The CLI uses the `/loculus-info` endpoint to dynamically discover instance configuration:

```python
# src/loculus_cli/instance_info.py
class InstanceInfo:
    def get_info(self) -> Dict:
        """Fetch instance info with caching."""
        response = httpx.get(f"{self.instance_url}/loculus-info")
        return response.json()
    
    def get_organisms(self) -> List[str]:
        """Get available organisms."""
        return list(self.get_info()["organisms"].keys())
    
    def get_lapis_url(self, organism: str) -> str:
        """Get LAPIS URL for specific organism."""
        return self.get_info()["hosts"]["lapis"][organism]
```

### Schema-Aware Filtering

The CLI validates metadata filters against organism schemas:

```python
# src/loculus_cli/utils/metadata_filter.py
class MetadataFilter:
    def validate_filter(self, filter_expr: str) -> Dict[str, str]:
        """Parse and validate filter expressions like 'geoLocCountry=USA'."""
        field, value = filter_expr.split('=', 1)
        
        if field not in self.get_searchable_fields():
            available = ", ".join(sorted(self.get_searchable_fields()))
            raise ValueError(f"Field '{field}' not searchable. Available: {available}")
        
        return {"field": field, "operator": "=", "value": value}
```

## Command Implementation

### Adding a New Command

1. Create a new file in `src/loculus_cli/commands/`
2. Define command group and individual commands
3. Register in `src/loculus_cli/cli.py`

Example:

```python
# src/loculus_cli/commands/example.py
import click
from rich.console import Console

console = Console()

@click.group(name="example")
def example_group() -> None:
    """Example commands."""
    pass

@example_group.command()
@click.option("--option", help="Example option")
@click.pass_context
def subcommand(ctx: click.Context, option: str) -> None:
    """Example subcommand."""
    instance = ctx.obj.get("instance")
    console.print(f"Processing with option: {option}")
```

Register in `cli.py`:

```python
# src/loculus_cli/cli.py
from .commands.example import example_group

cli.add_command(example_group)
```

### Using Rich for Output

The CLI uses Rich for formatted terminal output:

```python
from rich.console import Console
from rich.table import Table

console = Console()

# Simple colored output
console.print("[green]✓[/green] Success message")
console.print("[red]✗[/red] Error message")

# Tables
table = Table(title="Results")
table.add_column("Field", style="cyan")
table.add_column("Value", style="green")
table.add_row("organism", "west-nile")
console.print(table)

# Progress indicators
with console.status("Processing..."):
    # Long running operation
    pass
```

## API Integration

### Backend API Client

```python
# Using the backend client
from loculus_cli.api.backend import BackendClient
from loculus_cli.auth.client import AuthClient

instance_config = get_instance_config()
auth_client = AuthClient(instance_config)
backend_client = BackendClient(instance_config, auth_client)

# Get user groups
groups = backend_client.get_groups("username")

# Submit sequences
response = backend_client.submit_sequences(
    username="user",
    organism="west-nile", 
    metadata=metadata_data,
    sequences=sequence_data,
    group_id=1
)
```

### LAPIS API Client

```python
# Using the LAPIS client
from loculus_cli.api.lapis import LapisClient

lapis_url = instance_config.get_lapis_url("west-nile")
lapis_client = LapisClient(lapis_url)

# Search sequences
result = lapis_client.get_sample_details(
    organism="west-nile",
    filters={"geoLocCountry": "USA"},
    limit=10
)

# Get FASTA sequences
sequences = lapis_client.get_aligned_sequences(
    organism="west-nile",
    filters={},
    limit=5
)
```

## Configuration Management

### Instance Configuration

```python
# src/loculus_cli/config.py
class InstanceConfig(BaseModel):
    instance_url: str
    keycloak_realm: str = "loculus"
    keycloak_client_id: str = "backend-client"
    
    @property
    def backend_url(self) -> str:
        """Get backend URL dynamically."""
        return self.instance_info.get_hosts()["backend"]
```

### Configuration Commands

```python
# Set configuration values
loculus config set default_instance cli.loculus.org
loculus config set output.format json

# Auto-configure from instance URL
loculus config configure https://cli.loculus.org

# List all configuration
loculus config list
```

## Authentication

### Keycloak Integration

```python
# src/loculus_cli/auth/client.py
class AuthClient:
    def login(self, username: str, password: str) -> TokenInfo:
        """Login with username/password."""
        # Exchanges credentials for JWT tokens
        # Stores tokens securely in keyring
        
    def get_auth_headers(self, username: str) -> Dict[str, str]:
        """Get headers for authenticated requests."""
        token = self.get_valid_token(username)
        return {"Authorization": f"Bearer {token.access_token}"}
```

### Secure Token Storage

The CLI uses the system keyring for secure token storage:

```python
# Tokens stored with unique keys per instance
keyring_key = f"{keycloak_url}#{username}"
keyring.set_password("loculus-cli", keyring_key, token_json)
```

## Schema Discovery

### Available Commands

```bash
# List all organisms
loculus schema organisms

# Show metadata schema for organism
loculus schema show --organism west-nile

# Show specific field details
loculus schema fields --organism west-nile --field geoLocCountry
```

### Implementation

```python
# src/loculus_cli/commands/schema.py
@schema_group.command()
@click.option("--organism", required=True)
def show(ctx: click.Context, organism: str) -> None:
    instance_config = get_instance_config(ctx.obj.get("instance"))
    schema = instance_config.get_organism_schema(organism)
    
    # Display schema information in formatted table
    for field in schema["metadata"]:
        if not field.get("notSearchable"):
            # Show searchable fields
            pass
```

## Error Handling

### Click Exceptions

```python
# Proper error handling pattern
try:
    result = some_operation()
    console.print("[green]✓[/green] Success")
except ValueError as e:
    console.print(f"[red]Error:[/red] {e}")
    raise click.ClickException(str(e))
except Exception as e:
    console.print(f"[red]Unexpected error:[/red] {e}")
    raise click.ClickException("Operation failed")
```

### Graceful Degradation

```python
# Handle optional features gracefully
try:
    advanced_feature()
except FeatureNotAvailable:
    console.print("[yellow]Warning:[/yellow] Advanced feature not available")
    fallback_operation()
```

## Testing

### Unit Tests

```python
# tests/test_config.py
import pytest
from loculus_cli.config import InstanceConfig

def test_instance_config():
    config = InstanceConfig(instance_url="https://example.com")
    assert config.instance_url == "https://example.com"
```

### Integration Tests

Integration tests use Playwright to test the CLI end-to-end:

```typescript
// integration-tests/tests/specs/cli/example.spec.ts
import { expect } from '@playwright/test';
import { cliTest } from '../../fixtures/cli.fixture';

cliTest.describe('Example CLI Tests', () => {
  cliTest('should perform operation', async ({ cliPage }) => {
    await cliPage.configure();
    
    const result = await cliPage.execute(['command', '--option', 'value']);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('expected output');
  });
});
```

### Test Fixtures

```typescript
// integration-tests/tests/fixtures/cli.fixture.ts
export const cliTest = test.extend<{ cliPage: CliPage }>({
  cliPage: async ({ pageWithACreatedUser }, use) => {
    const cliPage = new CliPage();
    await cliPage.cleanup(); // Ensure clean state
    
    try {
      await use(cliPage);
    } finally {
      await cliPage.cleanup();
    }
  },
});
```

## Common Development Tasks

### Adding a New Filter Field

1. Ensure field is in organism schema (backend change)
2. CLI automatically picks it up via schema discovery
3. Test with: `loculus get sequences --organism west-nile --filter newField=value`

### Adding a New Output Format

```python
# In src/loculus_cli/commands/get.py
@click.option(
    "--format", 
    type=click.Choice(["table", "json", "tsv", "fasta", "xml"]), # Add "xml"
    default="table"
)

def _output_data(data, output_format, output, fields):
    if output_format == "xml":
        output_text = convert_to_xml(data)
    # ... existing formats
```

### Supporting a New Instance

1. Ensure instance has `/loculus-info` endpoint
2. Configure CLI: `loculus config configure https://new-instance.org`
3. Discover organisms: `loculus schema organisms`
4. Use normally with dynamic discovery

### Debugging

```bash
# Enable verbose output
loculus --verbose command

# Check configuration
loculus config list

# Test authentication
loculus auth status

# Verify schema discovery
loculus schema show --organism west-nile

# Test with different instances
LOCULUS_INSTANCE=https://other-instance.org loculus command
```

## Best Practices

### Command Design

- Use descriptive command names and help text
- Provide examples in help strings
- Use consistent option naming across commands
- Validate inputs early with clear error messages

### Error Messages

- Be specific about what went wrong
- Suggest corrective actions when possible
- Use consistent formatting with Rich
- Include context (instance, organism, etc.)

### Performance

- Cache expensive operations (schema discovery)
- Use appropriate HTTP timeouts
- Clean up resources in finally blocks
- Minimize API calls where possible

### Security

- Never log sensitive information (tokens, passwords)
- Use keyring for credential storage
- Validate all user inputs
- Handle authentication errors gracefully

This documentation should help developers understand the CLI architecture and get started with development tasks. For specific implementation details, refer to the source code and existing examples in the commands directory.