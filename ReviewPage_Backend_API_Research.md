# ReviewPage Backend API Research

## Overview

This document provides a comprehensive analysis of how the ReviewPage works on the Loculus website and documents all the backend API endpoints it calls. This research is intended to inform the implementation of a `status` command for the CLI.

## ReviewPage Functionality

The ReviewPage is the central component for reviewing submitted sequences before they are released to the public. It provides a workflow for managing sequence submissions through different processing states.

### Core Components

1. **ReviewPage.tsx** - Main container component
2. **ReviewCard.tsx** - Individual sequence entry display
3. **FilesDialog.tsx** - Modal for viewing associated files  
4. **SequencesDialog.tsx** - Modal for viewing processed sequences

### Sequence Processing States

Sequences progress through these states in the system:

- **RECEIVED** - Just submitted, awaiting processing
- **IN_PROCESSING** - Currently being processed by the pipeline
- **PROCESSED** - Processing complete, ready for review

### Processing Results

Once processed, sequences have one of these results:

- **NO_ISSUES** - Passed QC, ready for approval (green status)
- **HAS_WARNINGS** - Passed QC with warnings, can be approved (yellow status)
- **HAS_ERRORS** - Failed QC, must be fixed before approval (red status)

## Backend API Endpoints Used

### 1. Get Sequences Endpoint

**Primary data fetching endpoint for the ReviewPage**

```
GET /{organism}/get-sequences
```

#### Parameters
- **Headers**: Authorization header with access token
- **Query Parameters**:
  - `groupIdsFilter` (string, optional) - Comma-separated list of group IDs
  - `statusesFilter` (string, optional) - Comma-separated list of status names  
  - `processingResultFilter` (string, optional) - Comma-separated list of processing results
  - `page` (number, optional) - 0-indexed page number
  - `size` (number, optional) - Number of entries per page

#### Example Request
```
GET /west-nile/get-sequences?groupIdsFilter=123&statusesFilter=RECEIVED,IN_PROCESSING,PROCESSED&processingResultFilter=NO_ISSUES,HAS_WARNINGS,HAS_ERRORS&page=0&size=50
Authorization: Bearer <access_token>
```

#### Response Structure
```typescript
{
  sequenceEntries: Array<{
    accession: string,
    version: number,
    status: "RECEIVED" | "IN_PROCESSING" | "PROCESSED" | "APPROVED_FOR_RELEASE",
    processingResult: "NO_ISSUES" | "HAS_WARNINGS" | "HAS_ERRORS" | null,
    submissionId: string,
    isRevocation: boolean,
    dataUseTerms: {
      type: "OPEN" | "RESTRICTED",
      restrictedUntil?: string
    },
    groupId: number,
    submitter: string
  }>,
  statusCounts: Record<string, number>,
  processingResultCounts: Record<string, number>
}
```

#### Usage in ReviewPage
- Called with 2-second refetch interval for real-time updates
- Supports filtering by status and processing results
- Provides pagination with configurable page sizes (10, 20, 50, 100)
- Returns status counts for filter UI

### 2. Get Data to Edit Endpoint

**Fetches detailed sequence information for individual entries**

```
GET /{organism}/get-data-to-edit/{accession}/{version}
```

#### Parameters
- **Headers**: Authorization header with access token
- **Path Parameters**:
  - `organism` (string) - The organism identifier
  - `accession` (string) - Sequence accession number
  - `version` (number) - Sequence version number

#### Example Request
```
GET /west-nile/get-data-to-edit/LOC_0000001/1
Authorization: Bearer <access_token>
```

#### Response Structure
```typescript
{
  accession: string,
  version: number,
  status: "RECEIVED" | "IN_PROCESSING" | "PROCESSED" | "APPROVED_FOR_RELEASE",
  groupId: number,
  submissionId: string,
  errors: Array<{
    unprocessedFields: Array<{name: string, type: "Metadata" | "NucleotideSequence"}>,
    processedFields: Array<{name: string, type: "Metadata" | "NucleotideSequence"}>,
    message: string
  }> | null,
  warnings: Array<{
    unprocessedFields: Array<{name: string, type: "Metadata" | "NucleotideSequence"}>,
    processedFields: Array<{name: string, type: "Metadata" | "NucleotideSequence"}>,
    message: string
  }> | null,
  originalData: {
    metadata: Record<string, string>,
    unalignedNucleotideSequences: Record<string, string>,
    files: Record<string, Array<{fileId: string, name: string}>> | null
  },
  processedData: {
    metadata: Record<string, string | number | Date | boolean | null>,
    unalignedNucleotideSequences: Record<string, string | null>,
    alignedNucleotideSequences: Record<string, string | null>,
    nucleotideInsertions: Record<string, Array<string>>,
    alignedAminoAcidSequences: Record<string, string | null>,
    aminoAcidInsertions: Record<string, Array<string>>,
    files: Record<string, Array<{fileId: string, name: string}>> | null
  }
}
```

#### Usage in ReviewPage
- Called for each sequence entry when it's processed (not called for RECEIVED or IN_PROCESSING states)
- Provides detailed metadata, sequence data, errors, and warnings
- Used by ReviewCard component to display validation messages and sequence details
- Enables viewing of processed sequences and associated files

### 3. Approve Processed Data Endpoint

**Approves sequences for release**

```
POST /{organism}/approve-processed-data
```

#### Parameters
- **Headers**: Authorization header with access token
- **Body**:
```typescript
{
  accessionVersionsFilter?: Array<{accession: string, version: number}>,
  groupIdsFilter: Array<number>,
  scope: "ALL" | "WITHOUT_WARNINGS"
}
```

#### Example Request
```
POST /west-nile/approve-processed-data
Authorization: Bearer <access_token>
Content-Type: application/json

{
  "groupIdsFilter": [123],
  "scope": "ALL"
}
```

#### Response Structure
```typescript
Array<{
  accession: string,
  version: number
}>
```

#### Usage in ReviewPage
- **Bulk approval**: Approves all valid sequences (with `scope: "ALL"`)
- **Individual approval**: Approves specific sequences using `accessionVersionsFilter`
- Triggers refetch of sequences after successful operation
- Updates localStorage with last approval time

### 4. Delete Sequences Endpoint

**Deletes/discards sequence entries**

```
DELETE /{organism}/delete-sequence-entry-versions
```

#### Parameters
- **Headers**: Authorization header with access token
- **Body**:
```typescript
{
  accessionVersionsFilter?: Array<{accession: string, version: number}>,
  groupIdsFilter: Array<number>,
  scope: "ALL" | "ALL_PROCESSED_AND_REVOCATIONS" | "PROCESSED_WITH_ERRORS" | "PROCESSED_WITH_WARNINGS"
}
```

#### Example Request
```
DELETE /west-nile/delete-sequence-entry-versions
Authorization: Bearer <access_token>
Content-Type: application/json

{
  "groupIdsFilter": [123],
  "scope": "PROCESSED_WITH_ERRORS"
}
```

#### Response Structure
```typescript
Array<{
  accession: string,
  version: number
}>
```

#### Usage in ReviewPage
- **Bulk deletion**: Deletes sequences by category using different scope values
  - `ALL` - Deletes all processed sequences
  - `PROCESSED_WITH_ERRORS` - Deletes only sequences with errors
- **Individual deletion**: Deletes specific sequences using `accessionVersionsFilter`
- Triggers refetch of sequences after successful operation

## File Download Endpoints

While not direct API calls from the ReviewPage components, the FilesDialog creates download links using this pattern:

```
GET /seq/{accession}.{version}/{category}/{filename}
```

#### Example
```
GET /seq/LOC_0000001.1/original/metadata.tsv
GET /seq/LOC_0000001.1/processed/alignment.fasta
```

These are standard HTTP file download endpoints that serve associated files for sequence entries.

## Real-time Updates

The ReviewPage implements real-time updates through:

- **2-second refetch interval** on the get-sequences endpoint
- **Loading states** during data fetching
- **Optimistic UI updates** during sequence state transitions

## Error Handling

Each endpoint has specific error handling:

- **Get Sequences**: Shows "Failed to query Group" on error
- **Delete Sequences**: Shows "Failed to delete sequence entries: {detail}"  
- **Approve Data**: Shows "Failed to approve processed sequence entries: {detail}"
- **Get Data to Edit**: Handled by the hook, shows connection errors

## Implementation Considerations for CLI Status Command

Based on this research, a CLI `status` command should:

1. **Primary endpoint**: Use `GET /{organism}/get-sequences` for main status information
2. **Support filtering**: Allow filtering by status and processing results
3. **Pagination**: Handle potentially large result sets with pagination
4. **Real-time updates**: Consider polling intervals for status monitoring
5. **Detailed view**: Use `GET /{organism}/get-data-to-edit/{accession}/{version}` for detailed status of specific sequences
6. **Group filtering**: Support filtering by user's accessible groups
7. **Status summaries**: Display counts by status and processing result similar to the web UI

### Suggested CLI Command Structure

```bash
# List all sequences with status
loculus status <organism>

# Filter by processing state
loculus status <organism> --status PROCESSED --result HAS_ERRORS

# Show detailed status for specific sequence
loculus status <organism> --accession LOC_0000001 --version 1

# Monitor status with periodic updates
loculus status <organism> --watch

# Show summary counts only
loculus status <organism> --summary
```

This would provide CLI users with equivalent functionality to the web ReviewPage for monitoring and managing their sequence submissions.