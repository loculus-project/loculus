# CLI Metadata Filtering Enhancement Plan

## Current Problem

The CLI's `get` command currently has hardcoded filter options (`--location`, `--date-from`, `--date-to`, `--host`) but Loculus supports arbitrary metadata fields that vary by organism. This creates a mismatch where:

1. Tests expect `geoLocCountry` but CLI only supports `--location`
2. Different organisms have different metadata schemas
3. Users can't filter by organism-specific metadata fields

## Proposed Solution: Dynamic Metadata Filtering

### 1. Add Generic Metadata Filter Option

Replace hardcoded filters with a flexible `--filter` option that accepts key-value pairs:

```bash
# Current (limited):
loculus get sequences --organism west-nile --location USA

# Proposed (flexible):
loculus get sequences --organism west-nile --filter geoLocCountry=USA
loculus get sequences --organism west-nile --filter geoLocCountry=USA --filter host=human
loculus get sequences --organism west-nile --filter "collectionDate>=2024-01-01"
```

### 2. Keep Convenience Options for Common Fields

Maintain backwards compatibility and ease-of-use for common operations:

```bash
# Date range convenience (maps to collectionDate filter)
loculus get sequences --organism west-nile --date-from 2024-01-01 --date-to 2024-12-31

# Location convenience (maps to appropriate location field per organism)
loculus get sequences --organism west-nile --location USA
```

### 3. Auto-Discovery of Metadata Schema

Add command to discover available metadata fields:

```bash
# Show all available metadata fields for an organism
loculus get schema --organism west-nile

# Output example:
# Available metadata fields for west-nile:
# - geoLocCountry (string)
# - geoLocAdmin1 (string) 
# - collectionDate (date)
# - host (string)
# - isolate (string)
```

## Implementation Plan

### Phase 1: Add Generic Filter Support

1. **Update CLI Command Interface**
   - Add `--filter` option that accepts `key=value` or `key>=value` etc.
   - Parse filter expressions into LAPIS query parameters
   - Support multiple `--filter` options

2. **Update API Client**
   - Modify LAPIS client to accept arbitrary metadata filters
   - Convert filter expressions to proper LAPIS query format

3. **Maintain Backwards Compatibility**
   - Keep existing `--location`, `--date-from`, `--date-to` options
   - Map them to appropriate metadata fields internally

### Phase 2: Smart Location Mapping

1. **Add Organism-Aware Location Mapping**
   - Query organism schema to determine location field name
   - Map `--location` to correct field (`geoLocCountry`, `location`, etc.)
   - Cache schema information for performance

### Phase 3: Schema Discovery

1. **Add Schema Command**
   - New `loculus get schema --organism <name>` command
   - Fetch and display available metadata fields
   - Show field types and example values

### Phase 4: Enhanced UX

1. **Auto-completion Support**
   - Generate shell completions for common metadata fields
   - Provide field name suggestions in error messages

2. **Filter Validation**
   - Validate filter field names against organism schema
   - Provide helpful error messages for invalid fields

## Example Implementation

### Updated Command Interface

```python
@click.option(
    "--filter",
    multiple=True,
    help="Filter by metadata field (e.g., 'geoLocCountry=USA', 'collectionDate>=2024-01-01')"
)
@click.option(
    "--location", 
    help="Filter by location (convenience option, maps to organism-specific location field)"
)
def get_sequences(organism, filter, location, ...):
    # Convert convenience options to filters
    filters = list(filter)
    if location:
        location_field = get_location_field_for_organism(organism)
        filters.append(f"{location_field}={location}")
    
    # Parse and apply filters
    query_params = parse_filters(filters)
    # ... rest of implementation
```

### Filter Expression Parser

```python
def parse_filters(filters: List[str]) -> Dict[str, Any]:
    """Parse filter expressions into LAPIS query parameters."""
    params = {}
    for filter_expr in filters:
        if '=' in filter_expr:
            key, value = filter_expr.split('=', 1)
            params[key] = value
        elif '>=' in filter_expr:
            key, value = filter_expr.split('>=', 1)
            params[f"{key}From"] = value
        elif '<=' in filter_expr:
            key, value = filter_expr.split('<=', 1)
            params[f"{key}To"] = value
    return params
```

## Benefits

1. **Flexibility**: Support any metadata field without CLI changes
2. **Organism-Agnostic**: Works with any organism's metadata schema
3. **Backwards Compatible**: Existing commands continue to work
4. **User-Friendly**: Convenience options for common operations
5. **Discoverable**: Schema command helps users find available fields

## Migration for Tests

Update integration tests to use the flexible approach:

```typescript
// Before:
await cliPage.getSequences({
  organism: 'west-nile',
  location: 'USA'  // This mapped to wrong field
});

// After:
await cliPage.getSequences({
  organism: 'west-nile',
  filters: ['geoLocCountry=USA']  // Explicit and correct
});
```

This approach makes the CLI more powerful and maintainable while solving the immediate test failures.