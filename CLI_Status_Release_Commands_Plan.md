# CLI Status and Release Commands Implementation Plan

## Overview

This document outlines the implementation plan for two new CLI commands: `status` and `release`. These commands provide functionality equivalent to the web ReviewPage for monitoring sequence submissions and releasing them for public access.

## Command 1: `status` - Sequence Status Monitoring

### Purpose
Monitor the status of submitted sequences, view processing results, and track progress through the pipeline.

### Command Interface

#### Basic Usage
```bash
loculus status <organism> [OPTIONS]
```

#### Options
```bash
# Filtering Options
--status TEXT              Filter by processing status (RECEIVED, IN_PROCESSING, PROCESSED)
--result TEXT              Filter by processing result (NO_ISSUES, HAS_WARNINGS, HAS_ERRORS)  
--group INTEGER            Filter by specific group ID
--accession TEXT           Show specific sequence by accession
--version INTEGER          Specify version (used with --accession)

# Display Options
--summary                  Show only summary counts
--detailed                 Show detailed information including errors/warnings
--format [table|json]      Output format (default: table)
--limit INTEGER            Limit number of results (default: 50)
--page INTEGER             Page number for pagination (default: 1)

# Monitoring Options
--watch                    Continuously monitor status (refresh every 2s)
--watch-interval INTEGER   Custom watch interval in seconds (default: 2)

# Convenience Filters
--errors-only             Show only sequences with errors (shorthand for --result HAS_ERRORS)
--warnings-only           Show only sequences with warnings (shorthand for --result HAS_WARNINGS)
--ready                   Show sequences ready for release (NO_ISSUES or HAS_WARNINGS)
--pending                 Show unprocessed sequences (RECEIVED or IN_PROCESSING)
```

#### Example Usage
```bash
# Show all sequences for west-nile
loculus status west-nile

# Show summary of sequence counts
loculus status west-nile --summary

# Monitor sequences with errors in real-time
loculus status west-nile --errors-only --watch

# Show detailed info for specific sequence
loculus status west-nile --accession LOC_000001 --detailed

# Show sequences ready for release in JSON format
loculus status west-nile --ready --format json

# Show processed sequences for specific group
loculus status west-nile --status PROCESSED --group 123
```

#### Output Formats

**Default Table View:**
```
STATUS      RESULT       ACCESSION    VERSION  SUBMISSION_ID     DATA_USE     SUBMITTER
PROCESSED   NO_ISSUES    LOC_000001   1        sub_001          OPEN         user@example.com  
PROCESSED   HAS_WARNINGS LOC_000002   1        sub_002          RESTRICTED   user@example.com
PROCESSED   HAS_ERRORS   LOC_000003   1        sub_003          OPEN         user@example.com
IN_PROCESSING -          LOC_000004   1        sub_004          OPEN         user@example.com

Summary: 4 total sequences (1 ready, 1 with warnings, 1 with errors, 1 processing)
```

**Summary View:**
```
Sequence Status Summary for west-nile:

Processing Status:
  RECEIVED:      2 sequences
  IN_PROCESSING: 3 sequences  
  PROCESSED:     15 sequences
  
Processing Results:
  NO_ISSUES:     8 sequences (ready for release)
  HAS_WARNINGS:  4 sequences (ready for release)  
  HAS_ERRORS:    3 sequences (requires attention)
  
Total: 20 sequences (12 ready for release, 3 need fixes)
```

**Detailed View (for specific sequence):**
```
Sequence: LOC_000001.1
Status: PROCESSED
Result: HAS_WARNINGS
Submission ID: sub_001
Submitter: user@example.com
Group: Lab Group (ID: 123)
Data Use Terms: OPEN
Submitted: 2024-01-15 10:30:00

Warnings:
  collection_date: Date format should be YYYY-MM-DD (got: 15/01/2024)
  
Metadata:
  sample_name: Sample001
  collection_date: 15/01/2024
  location: New York
  host: human
```

### API Integration

**Primary Endpoint:** `GET /{organism}/get-sequences`
- Implement pagination with `page` and `size` parameters
- Use filtering with `statusesFilter` and `processingResultFilter`
- Handle real-time updates for watch mode

**Detailed View Endpoint:** `GET /{organism}/get-data-to-edit/{accession}/{version}`
- Fetch detailed information when `--detailed` or specific `--accession` is used
- Display errors, warnings, and full metadata

---

## Command 2: `release` - Sequence Release Management

### Purpose
Approve processed sequences for public release, with support for bulk operations and safety checks.

### Command Interface

#### Basic Usage
```bash
loculus release <organism> [OPTIONS]
```

#### Options
```bash
# Target Selection
--accession TEXT           Release specific sequence by accession
--version INTEGER          Specify version (used with --accession, default: latest)
--group INTEGER            Release sequences from specific group only

# Bulk Release Options  
--all-valid                Release all sequences without errors (NO_ISSUES + HAS_WARNINGS)
--no-warnings-only         Release only sequences with NO_ISSUES
--filter-status TEXT       Release sequences with specific status (default: PROCESSED)
--filter-result TEXT       Release sequences with specific result

# Safety Options
--dry-run                  Show what would be released without actually releasing
--force                    Skip confirmation prompts
--confirm                  Require explicit confirmation (default for bulk operations)

# Display Options
--quiet                    Minimal output (only errors)
--verbose                  Detailed output including individual sequence results
```

#### Example Usage
```bash
# Release specific sequence (with confirmation)
loculus release west-nile --accession LOC_000001

# Release all valid sequences (dry run first)
loculus release west-nile --all-valid --dry-run
loculus release west-nile --all-valid --confirm

# Release sequences without warnings only
loculus release west-nile --no-warnings-only

# Release sequences from specific group
loculus release west-nile --group 123 --all-valid

# Force release without prompts (use carefully)
loculus release west-nile --accession LOC_000001 --force
```

#### Safety Features

**Confirmation Prompts:**
```bash
$ loculus release west-nile --all-valid

Found 12 sequences ready for release:
  8 with no issues
  4 with warnings

This will make these sequences publicly available. Continue? [y/N]: y

Releasing sequences...
✓ Released LOC_000001.1
✓ Released LOC_000002.1
⚠ Failed to release LOC_000003.1: Permission denied
...

Successfully released 11 of 12 sequences.
```

**Dry Run Output:**
```bash
$ loculus release west-nile --all-valid --dry-run

Would release 12 sequences:

NO_ISSUES (8 sequences):
  LOC_000001.1 (sub_001) - user@example.com
  LOC_000002.1 (sub_002) - user@example.com
  ...

HAS_WARNINGS (4 sequences):  
  LOC_000009.1 (sub_009) - user@example.com
    Warning: collection_date format should be YYYY-MM-DD
  ...

Use --confirm to proceed with release.
```

### API Integration

**Primary Endpoint:** `POST /{organism}/approve-processed-data`
- Use `accessionVersionsFilter` for specific sequences
- Use `scope: "ALL"` for bulk valid sequences
- Use `scope: "WITHOUT_WARNINGS"` for no-warnings-only
- Handle `groupIdsFilter` for group-specific releases

**Pre-release Validation:** `GET /{organism}/get-sequences`  
- Fetch sequences to validate before release
- Show preview in dry-run mode
- Verify permissions and status

---

## Implementation Architecture

### File Structure
```
cli/src/loculus_cli/commands/
├── status.py          # Status command implementation
├── release.py         # Release command implementation
└── review_utils.py    # Shared utilities for both commands
```

### Shared Utilities (`review_utils.py`)

```python
from dataclasses import dataclass
from typing import List, Optional, Dict, Any
from enum import Enum

class SequenceStatus(str, Enum):
    RECEIVED = "RECEIVED"
    IN_PROCESSING = "IN_PROCESSING" 
    PROCESSED = "PROCESSED"
    APPROVED_FOR_RELEASE = "APPROVED_FOR_RELEASE"

class ProcessingResult(str, Enum):
    NO_ISSUES = "NO_ISSUES"
    HAS_WARNINGS = "HAS_WARNINGS"
    HAS_ERRORS = "HAS_ERRORS"

@dataclass
class SequenceEntry:
    accession: str
    version: int
    status: SequenceStatus
    processing_result: Optional[ProcessingResult]
    submission_id: str
    submitter: str
    group_id: int
    data_use_terms: Dict[str, Any]
    is_revocation: bool

class ReviewApiClient:
    """API client for review-related operations"""
    
    def get_sequences(
        self,
        organism: str,
        group_ids: Optional[List[int]] = None,
        statuses: Optional[List[SequenceStatus]] = None,
        results: Optional[List[ProcessingResult]] = None,
        page: int = 0,
        size: int = 50
    ) -> Dict[str, Any]:
        """Fetch sequences with filtering and pagination"""
        
    def get_sequence_details(
        self, 
        organism: str, 
        accession: str, 
        version: int
    ) -> Dict[str, Any]:
        """Fetch detailed sequence information"""
        
    def approve_sequences(
        self,
        organism: str,
        group_ids: List[int],
        accession_versions: Optional[List[Dict[str, Any]]] = None,
        scope: str = "ALL"
    ) -> List[Dict[str, Any]]:
        """Approve sequences for release"""

def format_sequence_table(sequences: List[SequenceEntry]) -> str:
    """Format sequences as table"""
    
def format_sequence_summary(status_counts: Dict, result_counts: Dict) -> str:
    """Format summary statistics"""
    
def get_user_groups(config: Config, organism: str) -> List[int]:
    """Get groups accessible to the current user"""
```

### Status Command Implementation (`status.py`)

```python
import click
import time
from rich.console import Console
from rich.table import Table
from rich.live import Live

@click.command()
@click.argument('organism')
@click.option('--status', type=click.Choice(['RECEIVED', 'IN_PROCESSING', 'PROCESSED']))
@click.option('--result', type=click.Choice(['NO_ISSUES', 'HAS_WARNINGS', 'HAS_ERRORS']))
@click.option('--group', type=int, help='Filter by group ID')
@click.option('--accession', help='Show specific sequence')
@click.option('--version', type=int, help='Sequence version')
@click.option('--summary', is_flag=True, help='Show summary only')
@click.option('--detailed', is_flag=True, help='Show detailed information')
@click.option('--format', type=click.Choice(['table', 'json']), default='table')
@click.option('--limit', type=int, default=50, help='Number of results')
@click.option('--page', type=int, default=1, help='Page number')
@click.option('--watch', is_flag=True, help='Monitor continuously')
@click.option('--watch-interval', type=int, default=2, help='Watch interval in seconds')
@click.option('--errors-only', is_flag=True, help='Show only sequences with errors')
@click.option('--warnings-only', is_flag=True, help='Show only sequences with warnings')
@click.option('--ready', is_flag=True, help='Show sequences ready for release')
@click.option('--pending', is_flag=True, help='Show unprocessed sequences')
def status(organism: str, **kwargs):
    """Show status of submitted sequences"""
    # Implementation here
```

### Release Command Implementation (`release.py`)

```python
import click
from rich.console import Console
from rich.prompt import Confirm

@click.command()
@click.argument('organism')
@click.option('--accession', help='Release specific sequence')
@click.option('--version', type=int, help='Sequence version')
@click.option('--group', type=int, help='Release from specific group')
@click.option('--all-valid', is_flag=True, help='Release all valid sequences')
@click.option('--no-warnings-only', is_flag=True, help='Release only sequences without warnings')
@click.option('--filter-status', help='Filter by status before release')
@click.option('--filter-result', help='Filter by result before release')
@click.option('--dry-run', is_flag=True, help='Show what would be released')
@click.option('--force', is_flag=True, help='Skip confirmations')
@click.option('--confirm', is_flag=True, help='Require confirmation')
@click.option('--quiet', is_flag=True, help='Minimal output')
@click.option('--verbose', is_flag=True, help='Detailed output')
def release(organism: str, **kwargs):
    """Release sequences for public access"""
    # Implementation here
```

### Error Handling

Both commands should handle:
- Network connectivity issues
- Authentication failures
- Permission errors (group access)
- Invalid organism/accession/version
- API rate limiting
- Partial failures in bulk operations

### Testing Strategy

1. **Unit Tests**: Test filtering logic, formatting functions, API client methods
2. **Integration Tests**: Test against test backend with known data
3. **CLI Tests**: Test command-line interface and option parsing
4. **Error Tests**: Test error handling and edge cases

### Documentation

1. Update CLI help text and `--help` output
2. Add examples to main CLI documentation
3. Update CLAUDE.md with new command usage
4. Create user guide with common workflows

---

## Implementation Priority

1. **Phase 1**: Basic `status` command with table output and filtering
2. **Phase 2**: Add `--watch` mode and detailed views to `status`
3. **Phase 3**: Implement `release` command with dry-run and safety features
4. **Phase 4**: Add JSON output, pagination, and advanced filtering
5. **Phase 5**: Polish UX, add comprehensive error handling and tests

This plan provides a comprehensive foundation for implementing both commands with a focus on usability, safety, and feature parity with the web ReviewPage.