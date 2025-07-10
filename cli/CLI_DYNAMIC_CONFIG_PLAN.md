# CLI Dynamic Configuration Plan

## Current Problem

The CLI currently hardcodes configuration values in the code:
- Backend URLs are constructed using patterns like `https://backend-{instance}`
- LAPIS URLs use patterns like `https://lapis-{instance}`
- Keycloak URLs use patterns like `https://authentication-{instance}`
- Organism schemas and available metadata fields are unknown

This approach breaks when instances use different URL patterns or when we need to discover available organisms and their metadata schemas.

## Solution: Dynamic Configuration via loculus-info Endpoint

Use the new `/loculus-info` endpoint to dynamically discover instance configuration, eliminating hardcoded URL patterns and enabling schema-aware operations. **Always use real field names - no convenience mappings or auto-detection.**

## Implementation Plan

### Phase 1: Replace Hardcoded URLs with Dynamic Discovery

#### 1.1 Create Instance Info Client

```python
# src/loculus_cli/config/instance_info.py
class InstanceInfo:
    """Client for fetching instance configuration from loculus-info endpoint."""
    
    def __init__(self, instance_url: str):
        self.instance_url = instance_url.rstrip('/')
        self._cache: Optional[Dict] = None
        self._cache_expiry: Optional[float] = None
        self.cache_ttl = 300  # 5 minutes
    
    def get_info(self) -> Dict:
        """Fetch instance info with caching."""
        if self._is_cache_valid():
            return self._cache
        
        response = httpx.get(f"{self.instance_url}/loculus-info")
        response.raise_for_status()
        
        self._cache = response.json()
        self._cache_expiry = time.time() + self.cache_ttl
        return self._cache
    
    def get_hosts(self) -> Dict[str, str]:
        """Get host URLs for backend, keycloak, website."""
        return self.get_info()["hosts"]
    
    def get_organisms(self) -> List[str]:
        """Get list of available organisms."""
        return list(self.get_info()["organisms"].keys())
    
    def get_organism_schema(self, organism: str) -> Dict:
        """Get metadata schema for specific organism."""
        info = self.get_info()
        if organism not in info["organisms"]:
            raise ValueError(f"Organism '{organism}' not found")
        return info["organisms"][organism]["schema"]
```

#### 1.2 Update InstanceConfig to Use Dynamic URLs

```python
# src/loculus_cli/config.py
@dataclass
class InstanceConfig:
    """Configuration for a Loculus instance."""
    instance_url: str
    
    # Remove hardcoded URL patterns
    # backend_url: str = Field(...)  # DELETE
    # lapis_url: str = Field(...)    # DELETE
    # keycloak_url: str = Field(...) # DELETE
    
    # Add dynamic discovery
    _instance_info: Optional[InstanceInfo] = None
    
    @property
    def instance_info(self) -> InstanceInfo:
        if self._instance_info is None:
            self._instance_info = InstanceInfo(self.instance_url)
        return self._instance_info
    
    @property
    def backend_url(self) -> str:
        return self.instance_info.get_hosts()["backend"]
    
    @property
    def keycloak_url(self) -> str:
        return self.instance_info.get_hosts()["keycloak"]
    
    @property
    def website_url(self) -> str:
        return self.instance_info.get_hosts()["website"]
    
    def get_lapis_url(self, organism: str) -> str:
        """Get LAPIS URL for specific organism."""
        hosts = self.instance_info.get_hosts()
        if organism not in hosts["lapis"]:
            raise ValueError(f"LAPIS not available for organism '{organism}'")
        return hosts["lapis"][organism]
```

#### 1.3 Update CLI Commands to Use Dynamic URLs

```python
# All commands that currently use instance_config.lapis_url need to be updated:

# OLD:
lapis_client = LapisClient(instance_config.lapis_url)

# NEW:
lapis_url = instance_config.get_lapis_url(organism)
lapis_client = LapisClient(lapis_url)
```

### Phase 2: Schema-Aware Metadata Filtering (No Auto-Mapping)

#### 2.1 Add Schema Discovery Commands

```python
# src/loculus_cli/commands/schema.py
@click.group()
def schema():
    """Schema discovery commands."""
    pass

@schema.command()
@click.option("--organism", required=True, help="Organism name")
@click.pass_context
def show(ctx: click.Context, organism: str):
    """Show metadata schema for organism."""
    instance = ctx.obj.get("instance")
    instance_config = get_instance_config(instance)
    
    try:
        schema = instance_config.instance_info.get_organism_schema(organism)
        
        console.print(f"[bold]Metadata schema for {organism}:[/bold]")
        console.print(f"Organism: {schema['organismName']}")
        console.print(f"Primary key: {schema['primaryKey']}")
        
        # Show metadata fields
        metadata_fields = schema["metadata"]
        table = Table(title="Available Metadata Fields")
        table.add_column("Field Name")
        table.add_column("Type")
        table.add_column("Display Name")
        table.add_column("Searchable")
        
        for field in metadata_fields:
            searchable = "No" if field.get("notSearchable") else "Yes"
            display_name = field.get("displayName", field["name"])
            table.add_row(field["name"], field["type"], display_name, searchable)
        
        console.print(table)
        
    except Exception as e:
        console.print(f"[red]Error: {e}[/red]")

@schema.command()
@click.pass_context
def organisms(ctx: click.Context):
    """List available organisms."""
    instance = ctx.obj.get("instance")
    instance_config = get_instance_config(instance)
    
    try:
        organisms = instance_config.instance_info.get_organisms()
        console.print("[bold]Available organisms:[/bold]")
        for organism in organisms:
            console.print(f"  • {organism}")
    except Exception as e:
        console.print(f"[red]Error: {e}[/red]")
```

#### 2.2 Implement Schema-Aware Metadata Filtering

```python
# src/loculus_cli/commands/get.py
class MetadataFilter:
    """Helper for parsing and validating metadata filters."""
    
    def __init__(self, instance_config: InstanceConfig, organism: str):
        self.instance_config = instance_config
        self.organism = organism
        self._schema = None
    
    @property
    def schema(self):
        if self._schema is None:
            self._schema = self.instance_config.instance_info.get_organism_schema(self.organism)
        return self._schema
    
    def get_searchable_fields(self) -> Set[str]:
        """Get set of searchable field names."""
        searchable = set()
        for field in self.schema["metadata"]:
            if not field.get("notSearchable", False):
                searchable.add(field["name"])
        return searchable
    
    def validate_filter(self, filter_expr: str) -> Dict[str, str]:
        """Parse and validate a filter expression."""
        # Parse "field=value", "field>=value" etc.
        operators = [">=", "<=", "="]
        for op in operators:
            if op in filter_expr:
                field, value = filter_expr.split(op, 1)
                field = field.strip()
                value = value.strip()
                
                # Validate field exists and is searchable
                if field not in self.get_searchable_fields():
                    available = ", ".join(sorted(self.get_searchable_fields()))
                    raise ValueError(f"Field '{field}' is not searchable. Available fields: {available}")
                
                return {"field": field, "operator": op, "value": value}
        
        raise ValueError(f"Invalid filter expression: {filter_expr}")
    
    def parse_filters(self, filters: List[str]) -> Dict[str, Any]:
        """Parse multiple filter expressions into LAPIS query parameters."""
        params = {}
        for filter_expr in filters:
            parsed = self.validate_filter(filter_expr)
            field = parsed["field"]
            operator = parsed["operator"]
            value = parsed["value"]
            
            if operator == "=":
                params[field] = value
            elif operator == ">=":
                params[f"{field}From"] = value
            elif operator == "<=":
                params[f"{field}To"] = value
        
        return params

# Update get sequences command - REMOVE ALL CONVENIENCE OPTIONS
@click.option(
    "--filter",
    "filters",
    multiple=True,
    help="Filter by metadata field (e.g., 'geoLocCountry=USA', 'sampleCollectionDateRangeLower>=2024-01-01')"
)
# REMOVE: @click.option("--location", ...)  # DELETE
# REMOVE: @click.option("--date-from", ...) # DELETE  
# REMOVE: @click.option("--date-to", ...)   # DELETE
# REMOVE: @click.option("--host", ...)      # DELETE
def get_sequences(organism: str, filters: List[str], ...):
    """Get sequences with schema-aware filtering."""
    instance = ctx.obj.get("instance")
    instance_config = get_instance_config(instance)
    
    # Create metadata filter helper
    metadata_filter = MetadataFilter(instance_config, organism)
    
    # Parse and validate filters - NO CONVENIENCE MAPPING
    try:
        query_params = metadata_filter.parse_filters(filters)
    except ValueError as e:
        console.print(f"[red]Filter error: {e}[/red]")
        raise click.ClickException(str(e))
    
    # Rest of implementation...
```

### Phase 3: Enhanced Configuration Management

#### 3.1 Auto-Configure from Instance URL

```python
# src/loculus_cli/commands/config.py
@config_group.command()
@click.argument("instance_url")
@click.pass_context
def auto_configure(ctx: click.Context, instance_url: str):
    """Auto-configure CLI from instance URL."""
    try:
        # Validate instance by fetching info
        instance_info = InstanceInfo(instance_url)
        info = instance_info.get_info()
        
        console.print(f"[green]✓[/green] Connected to {info['title']}")
        console.print(f"Version: {info['version']}")
        console.print(f"Available organisms: {', '.join(instance_info.get_organisms())}")
        
        # Extract instance name from URL
        instance_name = instance_url.replace("https://", "").replace("http://", "")
        
        # Save configuration
        config = get_config()
        config.default_instance = instance_name
        config.instances[instance_name] = InstanceConfig(instance_url=instance_url)
        save_config(config)
        
        console.print(f"[green]✓[/green] Configured instance '{instance_name}' as default")
        
    except Exception as e:
        console.print(f"[red]Error: Failed to configure instance: {e}[/red]")
        raise click.ClickException(str(e))
```

## Benefits

1. **No More Hardcoded URLs**: URLs are discovered dynamically from each instance
2. **Schema Awareness**: CLI knows what metadata fields are available for each organism
3. **Better Error Messages**: Can suggest valid field names when user makes mistakes
4. **Future-Proof**: Works with any Loculus instance regardless of URL patterns
5. **Explicit Field Names**: Users must use real field names, making commands clear and unambiguous
6. **Schema Discovery**: Built-in commands to explore available fields and organisms

## Migration Path

1. **Phase 1**: Update existing instances to use dynamic URL discovery (backwards compatible)
2. **Phase 2**: Add schema commands and smart filtering (additive)
3. **Phase 3**: Add auto-configuration convenience commands (additive)

This approach solves the immediate test issues while making the CLI much more robust and user-friendly.