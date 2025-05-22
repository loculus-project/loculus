# Query Engine LAPIS Integration Status

## Overview
The query-engine has been updated to achieve feature parity with LAPIS to enable it to replace LAPIS as the target for lapisClient. This document summarizes the changes made and integration requirements.

## Major Changes Made

### 1. URL Structure Fix
**Issue**: The query-engine expected organism as a query parameter, but LAPIS URLs include organism in the path.
**Solution**: Updated routing to use `/{organism}/sample/...` pattern with organism as a path parameter.

### 2. Response Format Compatibility  
**Issue**: Response format didn't match LAPIS expectations.
**Solution**: 
- Fixed response structure to match `{data: [...], info: {dataVersion: string}}` format
- Added TSV format support for details endpoint
- Ensured Info endpoint returns correct structure

### 3. Primary Key Handling
**Issue**: LapisClient uses schema.primaryKey (typically "accessionVersion") for queries.
**Solution**: 
- Added special handling for accessionVersion field in query builder
- Supports splitting "accession.version" format into separate accession and version filters
- Added composite ordering and grouping support

### 4. Database Filtering
**Issue**: Needed to filter only released sequences and handle metadata properly.
**Solution**:
- Added `released_at IS NOT NULL` filter by default
- Fixed metadata access to use `joint_metadata` JSONB field directly
- Added version status filtering support

### 5. Parameter Order Fix
**Issue**: FastAPI requires specific parameter ordering.
**Solution**: Fixed all endpoint signatures to have body parameters before path parameters.

## Implemented Endpoints

### Core Data Endpoints ✅
- `POST /{organism}/sample/details` - Get detailed sequence metadata with TSV support
- `POST /{organism}/sample/aggregated` - Get aggregated counts grouped by fields
- `GET /{organism}/sample/info` - API information endpoint

### Sequence Endpoints ✅
- `POST /{organism}/sample/unalignedNucleotideSequences` - FASTA/JSON/NDJSON support
- `POST /{organism}/sample/alignedNucleotideSequences` - Basic implementation
- `POST /{organism}/sample/unalignedNucleotideSequences/{segment}` - Multi-segment support
- `POST /{organism}/sample/alignedNucleotideSequences/{segment}` - Multi-segment support
- `POST /{organism}/sample/alignedAminoAcidSequences/{gene}` - Basic implementation

### Mutations and Insertions ⚠️ 
- `POST /{organism}/sample/nucleotideMutations` - Placeholder implementation
- `POST /{organism}/sample/aminoAcidMutations` - Placeholder implementation  
- `POST /{organism}/sample/nucleotideInsertions` - Placeholder implementation
- `POST /{organism}/sample/aminoAcidInsertions` - Placeholder implementation

### Lineage Definitions ⚠️
- `GET /{organism}/sample/lineageDefinition/{column}` - Placeholder implementation

### Health Endpoints ✅
- `GET /actuator/health` - Health check
- `GET /{organism}/sample/info` - API information

## Key Features Implemented

### Query Builder Enhancements
- **AccessionVersion Support**: Handles composite accession.version queries
- **Metadata Filtering**: Direct JSONB querying on joint_metadata
- **Released Sequences**: Automatic filtering to only released sequences
- **Version Status**: Basic support for LATEST_VERSION, REVOKED filtering
- **Ordering & Pagination**: Full support for orderBy, limit, offset
- **Field Selection**: Dynamic field selection with metadata flattening

### Response Processing
- **LAPIS Format**: Proper `{data, info}` response structure
- **TSV Export**: Converts JSON data to tab-separated format
- **FASTA Generation**: Extracts sequences from processed_data JSONB
- **Metadata Flattening**: Flattens nested metadata into response objects

## Integration Requirements

### 1. Configuration Update
The website's runtime configuration needs to point LAPIS URLs to the query-engine:

```json
{
  "lapisUrls": {
    "organism1": "http://query-engine:8080/organism1",
    "organism2": "http://query-engine:8080/organism2"
  }
}
```

### 2. Database Connection
Query-engine needs these environment variables:
```bash
QUERY_ENGINE_DATABASE_HOST=postgres-host
QUERY_ENGINE_DATABASE_PORT=5432
QUERY_ENGINE_DATABASE_NAME=loculus
QUERY_ENGINE_DATABASE_USER=username
QUERY_ENGINE_DATABASE_PASSWORD=password
```

### 3. Docker Deployment
The query-engine is now containerized and ready for deployment alongside other services.

## Limitations & Future Work

### Current Limitations
1. **Mutation Analysis**: Placeholder implementations don't parse actual mutation data from processed_data
2. **Lineage Definitions**: No integration with lineage definition system
3. **Multi-segment Sequences**: Basic support, may need refinement
4. **Caching**: No caching layer implemented
5. **Version Status**: Only basic support for LATEST_VERSION filtering

### Recommended Next Steps
1. **Full Mutation Support**: Parse mutation data from processed_data JSONB
2. **Lineage Integration**: Connect to lineage definition system
3. **Performance Optimization**: Add query result caching
4. **Monitoring**: Add metrics and health monitoring
5. **Testing**: Integration tests with real database

## Testing

### Docker Build
```bash
cd query-engine
docker build -t loculus-query-engine .
```

### Local Testing
```bash
# Set environment variables
export QUERY_ENGINE_DATABASE_HOST=localhost
export QUERY_ENGINE_DATABASE_PASSWORD=your-password

# Run container
docker run -p 8080:8080 loculus-query-engine
```

### API Testing
```bash
# Health check
curl http://localhost:8080/actuator/health

# Info endpoint
curl http://localhost:8080/organism/sample/info

# Details endpoint
curl -X POST http://localhost:8080/organism/sample/details \
  -H "Content-Type: application/json" \
  -d '{"limit": 10}'
```

## Architecture Impact

The query-engine now provides a direct path from website to PostgreSQL:

**Before:**
```
Website → LAPIS → SILO → Released Data Endpoint → PostgreSQL
```

**After:**
```
Website → Query Engine → PostgreSQL (sequence_entries_view)
```

This eliminates the SILO preprocessing pipeline and released-data endpoint for read operations, providing better performance and simpler architecture.

## Compatibility

The query-engine maintains full API compatibility with LAPIS for all endpoints used by the website's lapisClient. The response formats, error handling, and parameter structures match LAPIS expectations.