# Loculus CLI Implementation Plan

## Overview

The Loculus CLI will be a Python-based command-line interface that provides comprehensive access to Loculus functionality, following the design patterns of tools like `gh` (GitHub CLI). It will support sequence submission, retrieval, search, and management operations.

## Architecture

### Core Components

1. **Main CLI Application** (`loculus`)
   - Entry point with subcommand structure
   - Global options (--instance, --config, --verbose)
   - Configuration management

2. **Authentication Module**
   - Keycloak integration
   - Token storage and refresh
   - Interactive and non-interactive auth flows

3. **API Client Module**
   - Backend API wrapper
   - LAPIS API wrapper
   - Request handling with retries
   - Response parsing and error handling

4. **Command Modules**
   - `auth` - Authentication management
   - `submit` - Sequence submission
   - `get` - Search and retrieve/download sequences
   - `revise` - Update existing sequences
   - `config` - CLI configuration
   - `status` - Check submission status (Future)
   - `group` - Manage submission groups (Future)

### Command Structure

```
loculus
├── auth
│   ├── login         # Interactive login
│   ├── logout        # Clear stored credentials
│   ├── status        # Show auth status
│   └── token         # Display current token
├── submit
│   ├── sequences     # Submit new sequences
│   ├── validate      # Validate files before submission
│   └── template      # Generate metadata template
├── get              # Search and download sequences
│   ├── sequences     # Search/download with filters
│   ├── details       # Get sequence details
│   ├── stats         # Get aggregated statistics
│   └── all          # Download all released data
├── revise
│   ├── sequence     # Revise a sequence
│   └── batch        # Batch revisions
├── config
│   ├── set          # Set configuration value
│   ├── get          # Get configuration value
│   └── list         # List all settings
│
└── [Future Commands]
    ├── status        # Check submission status
    │   ├── list     # List submissions
    │   ├── show     # Show submission details
    └── group         # Manage submission groups
        ├── create   # Create new group
        ├── list     # List groups
        ├── members  # Manage group members
        └── delete   # Delete group
```

## Implementation Details

### 1. Project Structure

```
cli/
├── pyproject.toml          # Project metadata and dependencies
├── README.md               # Documentation
├── src/
│   └── loculus_cli/
│       ├── __init__.py
│       ├── __main__.py     # Entry point
│       ├── cli.py          # Main CLI setup
│       ├── config.py       # Configuration management
│       ├── auth/
│       │   ├── __init__.py
│       │   ├── client.py   # Keycloak client
│       │   └── commands.py # Auth subcommands
│       ├── api/
│       │   ├── __init__.py
│       │   ├── backend.py  # Backend API client
│       │   ├── lapis.py    # LAPIS API client
│       │   └── models.py   # Data models
│       ├── commands/
│       │   ├── __init__.py
│       │   ├── submit.py
│       │   ├── get.py
│       │   ├── revise.py
│       │   ├── config.py
│       │   └── # status.py (future)
│       │   └── # group.py (future)
│       └── utils/
│           ├── __init__.py
│           ├── formatting.py # Output formatting
│           ├── validation.py # Input validation
│           └── progress.py   # Progress bars
└── tests/
    └── unit/
```

### 2. Key Features

#### Authentication
- Store tokens securely using keyring library
- Support for multiple Loculus instances
- Automatic token refresh
- Environment variable support for CI/CD

#### Submission
- Validate metadata and sequences before upload
- Progress tracking for large files
- Batch submission support
- Generate metadata templates for organisms
- Dry-run mode for validation

#### Get (Search & Download)
- Unified search and download with optional output to file
- Rich query syntax matching LAPIS capabilities
- Multiple output formats (JSON, TSV, FASTA, NDJSON)
- Streaming for large result sets
- Field selection and filtering
- Display results in terminal or save to file
- Pagination support for interactive browsing

#### User Experience
- Colored output with rich formatting
- Progress indicators for long operations
- Interactive prompts where appropriate
- Comprehensive error messages
- Verbose and debug modes

### 3. Dependencies

```toml
[tool.poetry.dependencies]
python = "^3.9"
click = "^8.1"           # CLI framework
httpx = "^0.25"          # HTTP client
pydantic = "^2.0"        # Data validation
keyring = "^24.0"        # Secure credential storage
rich = "^13.0"           # Terminal formatting
tabulate = "^0.9"        # Table formatting
biopython = "^1.81"      # Sequence handling
pyyaml = "^6.0"          # Config files
python-dateutil = "^2.8"

[tool.poetry.group.dev.dependencies]
pytest = "^7.4"
pytest-asyncio = "^0.21"
pytest-mock = "^3.11"
black = "^23.0"
mypy = "^1.5"
ruff = "^0.1"
```

### 4. Configuration

Configuration hierarchy:
1. Command-line arguments
2. Environment variables (`LOCULUS_*`)
3. Project config file (`.loculus.yml`)
4. User config file (`~/.config/loculus/config.yml`)
5. Default values

Example config:
```yaml
default_instance: main.loculus.org
instances:
  main.loculus.org:
    backend_url: https://main.loculus.org/api/v2
    lapis_url: https://main.loculus.org/api/v1
    keycloak_url: https://authentication-main.loculus.org
output:
  format: table
  color: auto
submission:
  chunk_size: 1000
  validate_before_submit: true
```

### 5. Integration with Existing System

#### Backend API Integration
- Use existing OpenAPI specs for type generation
- Match error handling patterns from web frontend
- Support all authentication flows

#### LAPIS Integration
- Implement full query syntax support
- Handle pagination for large results
- Support all output formats

#### Testing Strategy
- Unit tests in the cli/tests directory
- Integration tests in integration-tests/tests/specs/cli/
- Leverage existing Playwright framework and fixtures
- Reuse test users, groups, and authentication from browser tests

### 6. Integration Testing Approach

The CLI tests will be integrated into the existing Playwright-based integration test framework in the `integration-tests` directory. This approach allows us to:
- Reuse existing test infrastructure
- Leverage browser-based user registration
- Maintain consistency with existing test patterns
- Avoid duplicating test utilities

#### Test Structure in integration-tests/

```
integration-tests/
├── tests/
│   ├── fixtures/
│   │   └── cli.fixture.ts      # CLI-specific test fixture
│   ├── pages/
│   │   └── CliPage.ts          # CLI command executor wrapper
│   └── specs/
│       └── cli/
│           ├── auth.spec.ts     # CLI authentication tests
│           ├── submit.spec.ts   # Submission workflow tests
│           ├── get.spec.ts      # Search and download tests
│           └── revise.spec.ts   # Revision workflow tests
```

#### CLI Test Fixture

```typescript
// cli.fixture.ts
export const cliTest = authTest.extend<{
  cliPage: CliPage;
}>({
  cliPage: async ({ pageWithACreatedUser }, use) => {
    // Extract auth token from browser context
    const cookies = await pageWithACreatedUser.context().cookies();
    const token = await extractAuthToken(cookies);
    
    // Create CLI page with authenticated context
    const cliPage = new CliPage(token);
    await use(cliPage);
  },
});
```

#### Authentication Bridge

Since the existing tests use browser-based authentication, we need to bridge this to CLI authentication:

1. **Option A: Cookie Extraction**
   - Extract session cookies from Playwright browser context
   - Convert to CLI-compatible auth format
   - Pass to CLI via environment variables

2. **Option B: Token Extraction**
   - After browser login, extract JWT token from localStorage/cookies
   - Store token in CLI config format
   - Use for CLI commands

3. **Option C: Test Mode**
   - Add a `--test-mode` flag to CLI
   - Allow passing pre-authenticated tokens
   - Skip normal authentication flow

#### Example Test Pattern

```typescript
cliTest.describe('CLI submission workflow', () => {
  cliTest('should submit sequences via CLI', async ({ cliPage, page }) => {
    // Use existing fixtures to create test data
    const metadataFile = 'test-data/metadata.tsv';
    const sequenceFile = 'test-data/sequences.fasta';
    
    // Execute CLI command
    const result = await cliPage.execute([
      'submit', 'sequences',
      '--metadata', metadataFile,
      '--sequences', sequenceFile,
      '--organism', 'Mpox'
    ]);
    
    // Verify submission
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Submission successful');
    
    // Use browser to verify submission appears in UI
    await page.goto('/submissions');
    await expect(page.getByText('sequences.fasta')).toBeVisible();
  });
});
```

### 7. Implementation Phases

#### Phase 1: Foundation (Week 1)
- Project setup and structure
- Basic CLI framework with Click
- Configuration management
- Authentication module with Keycloak

#### Phase 2: Core Commands (Week 2)
- Submit command with validation
- Get command (search and download functionality)
- Error handling framework
- Basic output formatting

#### Phase 3: Advanced Features (Week 3)
- Revision support
- Multiple output formats (JSON, TSV, FASTA, NDJSON)
- Rich terminal output with tables
- Progress indicators and streaming

#### Phase 4: Integration Testing (Week 4)
- Implement CLI test fixtures in integration-tests/
- Add CLI-specific page objects and utilities
- Create comprehensive CLI test suite
- Integrate with existing CI/CD pipeline

#### Future Phases
- Status command implementation
- Group management functionality
- Advanced caching and offline support

### 8. Example Usage

```bash
# Initial setup
loculus auth login
loculus config set default_instance main.loculus.org

# Submit sequences
loculus submit sequences \
  --metadata samples.tsv \
  --sequences sequences.fasta \
  --organism "Mpox" \
  --group my-lab-group

# Get sequences (search and display)
loculus get sequences \
  --organism "Mpox" \
  --location "USA" \
  --date-from "2024-01-01" \
  --limit 10

# Get sequences and save to file
loculus get sequences \
  --organism "Mpox" \
  --location "USA" \
  --date-from "2024-01-01" \
  --format json \
  --output results.json

# Get specific sequences by accession
loculus get sequences \
  --accessions ACC123,ACC124,ACC125 \
  --format fasta \
  --output sequences.fasta

# Get all released data
loculus get all \
  --format ndjson \
  --output all_sequences.ndjson

# Check submission status (future feature)
# loculus status list --pending
# loculus status show SUBMISSION-ID

# Revise a sequence
loculus revise sequence ACC123 \
  --metadata updated.tsv \
  --sequences updated.fasta
```

### 9. Success Criteria

1. **Functionality**: All major Loculus operations accessible via CLI
2. **Performance**: Efficient handling of large datasets (10k+ sequences)
3. **Usability**: Intuitive commands with helpful error messages
4. **Reliability**: Comprehensive test coverage (>90%)
5. **Integration**: Seamless integration with existing workflows
6. **Documentation**: Complete user guide and API documentation

### 10. Future Enhancements

- Plugin system for custom commands
- Shell completion scripts
- Batch operations with job queuing
- Local sequence validation cache
- Integration with bioinformatics pipelines
- GraphQL support when available

## Conclusion

This CLI will provide a powerful, user-friendly interface to Loculus, enabling efficient programmatic access to all platform features while maintaining consistency with the web interface and APIs. The modular architecture ensures maintainability and extensibility for future enhancements.