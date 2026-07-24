# GitHub Copilot Instructions for Loculus

## About Loculus

Loculus is a software package to power microbial genomic databases. It supports upload and storage of consensus sequences and metadata, flexible data preprocessing, powerful searches, and is highly configurable for both single- and multi-segmented genomes.

## Project Structure

The repository is organized into several key components:

- **`backend/`** - Kotlin backend service (Spring Boot)
- **`website/`** - Frontend web application (Astro, React, TypeScript)
- **`integration-tests/`** - End-to-end Playwright tests
- **`preprocessing/`** - Sequence and metadata processing pipeline
- **`ingest/`** - Data ingestion components
- **`kubernetes/`** - Deployment configurations and Helm charts
- **`keycloak/`** - Authentication service configuration
- **`cli/`** - Command-line interface tools
- **`docs/`** - Documentation website

## Component-Specific Instructions

Each major component has its own `AGENTS.md` file with detailed instructions:

- Backend: [`backend/AGENTS.md`](/backend/AGENTS.md)
- Website: [`website/AGENTS.md`](/website/AGENTS.md)
- Integration Tests: [`integration-tests/AGENTS.md`](/integration-tests/AGENTS.md)

Refer to these files for component-specific development guidelines, testing procedures, and best practices.

## Commit Conventions

We follow [conventional commits](https://www.conventionalcommits.org) for all commit messages and PR titles:

- Format: `type(scope): description`
- Types: `feat`, `fix`, `chore`, `docs`, `test`, `refactor`, `style`, `perf`
- Scopes (components): `website`, `backend`, `deployment`, `preprocessing`, `ingest`, `deposition`
- Examples:
  - `feat(website): add sequence search functionality`
  - `fix!(backend): [CFG] update database schema`
  - `chore(deployment): update kubernetes configs`

**Breaking changes:** Mark with `!` (e.g., `feat!:` or `fix!:`). Use `[CFG]` to indicate configuration changes needed in values.yaml.

## Pull Request Requirements

- **Title:** Use conventional commit format
- **Description:** Write detailed PR summaries, not just bullet points
- **Testing:** Ensure all tests pass before submitting
- **Code Style:** Follow the style guidelines for each component

## Testing and Building

### Backend (Kotlin)

```bash
# Run tests (with Docker)
./gradlew test --console=plain

# Run tests (without Docker, for cloud environments)
USE_NONDOCKER_INFRA=true ./gradlew test --console=plain

# Lint/format code
./gradlew ktlintFormat
```

Backend tests take considerable time to run. Always ensure tests and lint pass before committing.

### Website (TypeScript/React)

```bash
# Run tests (important: use CI=1 to prevent watch mode)
CI=1 npm run test

# Type checking
npm run check-types

# Format code
npm run format
```

**Important:** Always include `CI=1` environment variable when running tests to ensure they run once and exit cleanly instead of staying in watch mode.

### Integration Tests

```bash
# Format code
npm run format

# Run tests against specific environment
PLAYWRIGHT_TEST_BASE_URL=https://main.loculus.org npx playwright test --reporter=list

# Control test execution
BROWSER=chromium TEST_SUITE=all npx playwright test --workers=4 --reporter=list
```

See [`integration-tests/AGENTS.md`](/integration-tests/AGENTS.md) for detailed setup instructions for local k3d testing.

## Code Style Guidelines

We value clean code. Follow these principles:

- **Expressive names:** Use clear variable, class, and function names; avoid abbreviations
- **Small functions and classes:** Keep code modular and focused
- **Test coverage:** Write tests for all non-trivial code; cover at least the happy path
- **Testability:** Design code with testing in mind
- **Generality:** Code should be configurable and suitable for various deployments

## Website-Specific Guidelines

### Preventing Flaky Playwright Tests

When adding or modifying interactive components in the website, ensure they are disabled until React hydration completes to prevent race conditions:

- **For buttons:** Use `Button` from `src/components/common/Button.tsx` instead of native `<button>`
- **For Headless UI Combobox:** Import from `src/components/common/headlessui/Combobox.tsx` instead of `@headlessui/react`
- **For other interactive elements:** Wrap with `DisabledUntilHydrated` or use the `useClientFlag` hook

### Website Codemods

For guidance on writing codemods, see [`website/codemods/AGENTS.md`](../website/codemods/AGENTS.md).

## Dependency Management

### Conda Environment Dependencies

Conda dependencies in `environment.yml` files are not automatically updated by Dependabot. Use utilities in the `maintenance-scripts/` folder to help update conda environment versions.

### Security

Always check for security vulnerabilities when adding or updating dependencies. Run security checks before committing.

## OpenAPI Documentation

The backend provides a Swagger UI and OpenAPI specification. Keep the OpenAPI specification accurate and useful when making API changes.

## Authentication

- **Keycloak** is used for authentication
- Test users are available: `testuser:testuser` and `superuser:superuser`
- Groups are managed by the backend; each sequence entry is owned by a submitting group
- See main [README.md](/README.md) for detailed authentication documentation

## Development Workflow

1. **Explore:** Understand the codebase before making changes
2. **Test locally:** Run relevant tests for the components you modify
3. **Lint/Format:** Run linters and formatters before committing
4. **Test coverage:** Ensure new code has appropriate test coverage
5. **Documentation:** Update docs if needed (OpenAPI specs, README files, etc.)
6. **PR:** Create a PR with conventional commit title and detailed description

## Additional Resources

- [Main README](/README.md) - Project overview and architecture
- [Contributing Guide](/CONTRIBUTING.md) - Detailed contribution guidelines
- [Architecture Docs](/architecture_docs) - System architecture documentation
- [GitHub Actions](/.github/workflows) - CI/CD workflows

## General Guidelines

- **Minimal changes:** Make the smallest possible changes to achieve the goal
- **No unrelated fixes:** Don't fix unrelated bugs or broken tests
- **Preserve working code:** Never delete/modify working code unless absolutely necessary
- **Security:** Always validate that changes don't introduce security vulnerabilities
- **Local testing:** Test changes locally before pushing
- **Docker awareness:** Some tests require Docker; use non-Docker alternatives when unavailable
