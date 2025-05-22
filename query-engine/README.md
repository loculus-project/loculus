# Loculus Query Engine

A FastAPI-based query engine that replaces LAPIS by querying directly from PostgreSQL instead of going through the get-released-data endpoint and SILO.

## Overview

This query engine provides the same REST API interface as LAPIS but queries the PostgreSQL database directly from the `sequence_entries_view` table. This eliminates the need for the SILO preprocessing pipeline and the get-released-data endpoint for read operations.

## Features

- **Direct PostgreSQL queries**: Bypasses SILO and queries the database directly
- **LAPIS API compatibility**: Provides the same endpoints and response formats as LAPIS
- **High performance**: Uses async database connections with connection pooling
- **Flexible filtering**: Supports all metadata fields for filtering and sorting

## API Endpoints

The query engine implements the following LAPIS-compatible endpoints:

### Core Data Endpoints
- `POST /sample/details` - Get detailed sequence metadata
- `POST /sample/aggregated` - Get aggregated counts grouped by specified fields

### Sequence Endpoints
- `POST /sample/unalignedNucleotideSequences` - Get unaligned nucleotide sequences (FASTA/JSON/NDJSON)
- `POST /sample/alignedNucleotideSequences` - Get aligned nucleotide sequences
- `POST /sample/unalignedNucleotideSequences/{segment}` - Get sequences for specific segment
- `POST /sample/alignedNucleotideSequences/{segment}` - Get aligned sequences for specific segment
- `POST /sample/alignedAminoAcidSequences/{gene}` - Get amino acid sequences for specific gene

### Mutations and Insertions (Placeholder)
- `POST /sample/nucleotideMutations` - Get nucleotide mutations (placeholder)
- `POST /sample/aminoAcidMutations` - Get amino acid mutations (placeholder)
- `POST /sample/nucleotideInsertions` - Get nucleotide insertions (placeholder)
- `POST /sample/aminoAcidInsertions` - Get amino acid insertions (placeholder)

### Lineage Definitions
- `GET /sample/lineageDefinition/{column}` - Get lineage definitions

### Health Checks
- `GET /actuator/health` - Health check endpoint
- `GET /sample/info` - API information endpoint

## Request Format

All endpoints accept a request body with the following structure:

```json
{
  "limit": 100,
  "offset": 0,
  "fields": ["accession", "version", "country", "date"],
  "orderBy": [
    {"field": "date", "type": "descending"}
  ],
  "country": "USA",
  "date": "2023-01-01",
  "dataFormat": "FASTA"
}
```

### Parameters
- `limit` (optional): Maximum number of results to return
- `offset` (optional): Number of results to skip
- `fields` (optional): List of fields to include in response
- `orderBy` (optional): Sort order specification
- `dataFormat` (optional): Response format for sequence endpoints (FASTA, JSON, NDJSON, TSV)
- Any other field: Used as filter criteria

## Configuration

The service is configured via environment variables with the `QUERY_ENGINE_` prefix:

```bash
QUERY_ENGINE_DATABASE_HOST=localhost
QUERY_ENGINE_DATABASE_PORT=5432
QUERY_ENGINE_DATABASE_NAME=loculus
QUERY_ENGINE_DATABASE_USER=postgres
QUERY_ENGINE_DATABASE_PASSWORD=secret
QUERY_ENGINE_DATABASE_POOL_MIN_SIZE=5
QUERY_ENGINE_DATABASE_POOL_MAX_SIZE=20
QUERY_ENGINE_LOG_LEVEL=INFO
```

## Running the Service

### Using Docker

```bash
docker build -t loculus-query-engine .
docker run -p 8080:8080 \
  -e QUERY_ENGINE_DATABASE_HOST=your-db-host \
  -e QUERY_ENGINE_DATABASE_PASSWORD=your-password \
  loculus-query-engine
```

### Local Development

```bash
pip install -r requirements.txt
uvicorn src.main:app --host 0.0.0.0 --port 8080 --reload
```

## Database Schema

The query engine primarily uses the `sequence_entries_view` PostgreSQL view which provides:

- Basic sequence metadata (accession, version, organism, submitter, etc.)
- Processing status and timestamps
- JSONB fields containing processed data and joint metadata
- Data use terms and restrictions

Key fields accessed:
- `accession`, `version` - Sequence identifiers
- `organism` - Organism type (used for filtering by organism)
- `joint_metadata` - JSONB containing all metadata fields
- `processed_data` - JSONB containing sequence data and processing results
- `status` - Processing/approval status
- `released_at` - Release timestamp for filtering released sequences

## Architecture

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Website       │───▶│  Query Engine    │───▶│   PostgreSQL    │
│   (LAPIS client)│    │   (FastAPI)      │    │   (Direct)      │
└─────────────────┘    └──────────────────┘    └─────────────────┘
```

This replaces the previous architecture:
```
┌─────────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────────┐
│   Website       │───▶│    LAPIS    │───▶│    SILO     │───▶│   PostgreSQL    │
│   (LAPIS client)│    │             │    │             │    │ (via released-  │
└─────────────────┘    └─────────────┘    └─────────────┘    │  data endpoint) │
                                                             └─────────────────┘
```

## Limitations

1. **Mutations and Insertions**: The current implementation provides placeholder responses for mutation and insertion endpoints. Full implementation would require parsing and aggregating mutation data from the processed_data JSONB field.

2. **Multi-segment sequences**: Basic support is provided, but full multi-segment handling may need refinement based on the specific data structure in processed_data.

3. **Lineage definitions**: Currently returns empty responses. Would need to integrate with the lineage definition system.

## Future Enhancements

1. **Mutation parsing**: Implement full mutation and insertion analysis from processed_data
2. **Caching layer**: Add Redis caching for frequently accessed data
3. **Query optimization**: Implement query result caching and database query optimization
4. **Streaming responses**: For large datasets, implement streaming responses
5. **Monitoring**: Add metrics and monitoring capabilities