"""Get/search commands for Loculus CLI."""

import json
from pathlib import Path
from typing import Any, Dict, List, Optional

import click
from rich.console import Console
from rich.table import Table

from ..api.backend import BackendClient
from ..api.lapis import LapisClient
from ..api.models import AccessionVersion
from ..auth.client import AuthClient
from ..config import get_instance_config
from ..utils.metadata_filter import MetadataFilter

console = Console()


@click.group(name="get")
def get_group() -> None:
    """Search and retrieve sequences."""
    pass


@get_group.command()
@click.option(
    "--organism",
    "-o",
    required=True,
    help="Organism name (use 'loculus schema organisms' to see available)",
)
@click.option(
    "--filter",
    "filters",
    multiple=True,
    help="Filter by metadata field (e.g., 'geoLocCountry=USA', 'sampleCollectionDateRangeLower>=2024-01-01'). Use 'loculus schema show --organism NAME' to see available fields.",
)
@click.option(
    "--accessions",
    help="Comma-separated list of accession.version",
)
@click.option(
    "--limit",
    type=int,
    default=10,
    help="Maximum number of results",
)
@click.option(
    "--offset",
    type=int,
    default=0,
    help="Offset for pagination",
)
@click.option(
    "--format",
    "output_format",
    type=click.Choice(["table", "json", "tsv", "fasta", "ndjson"]),
    default="table",
    help="Output format",
)
@click.option(
    "--output",
    "-f",
    type=click.Path(path_type=Path),
    help="Output file path (default: stdout)",
)
@click.option(
    "--fields",
    help="Comma-separated list of fields to include",
)
@click.option(
    "--aligned",
    is_flag=True,
    help="Get aligned sequences (for FASTA format)",
)
@click.pass_context
def sequences(
    ctx: click.Context,
    organism: str,
    filters: List[str],
    accessions: Optional[str],
    limit: int,
    offset: int,
    output_format: str,
    output: Optional[Path],
    fields: Optional[str],
    aligned: bool,
) -> None:
    """Search and retrieve sequences."""
    instance = ctx.obj.get("instance")
    instance_config = get_instance_config(instance)
    
    auth_client = AuthClient(instance_config)
    lapis_client = None
    
    try:
        # Get LAPIS URL for this organism
        lapis_url = instance_config.get_lapis_url(organism)
        lapis_client = LapisClient(lapis_url)
        
        # Parse and validate filters using schema
        filter_params = {}
        if filters:
            try:
                metadata_filter = MetadataFilter(instance_config, organism)
                filter_params = metadata_filter.parse_filters(filters)
            except ValueError as e:
                console.print(f"[red]Filter error: {e}[/red]")
                console.print()
                console.print("Use 'loculus schema show --organism {} --help' to see available fields".format(organism))
                raise click.ClickException(str(e))
        
        # Handle accessions
        if accessions:
            accession_list = []
            for acc in accessions.split(","):
                acc = acc.strip()
                if "." in acc:
                    accession, version = acc.split(".", 1)
                    accession_list.append(AccessionVersion(accession=accession, version=int(version)))
                else:
                    accession_list.append(AccessionVersion(accession=acc, version=1))
            
            # For accessions, we might want to use the backend API instead
            if accession_list:
                backend_client = BackendClient(instance_config, auth_client)
                current_user = auth_client.get_current_user()
                
                sequences_data = backend_client.get_sequences(
                    username=current_user,
                    organism=organism,
                    accession_versions=accession_list,
                )
                
                # Convert to LAPIS-like format
                data = []
                for seq in sequences_data:
                    data.append(seq.data)
                
                _output_data(data, output_format, output, fields)
                backend_client.close()
                return
        
        # Parse fields
        field_list = None
        if fields:
            field_list = [f.strip() for f in fields.split(",")]
        
        # Query LAPIS
        if output_format == "fasta":
            with console.status("Fetching sequences..."):
                if aligned:
                    result = lapis_client.get_aligned_sequences(
                        organism=organism,
                        filters=filter_params,
                        limit=limit,
                        offset=offset,
                    )
                else:
                    result = lapis_client.get_unaligned_sequences(
                        organism=organism,
                        filters=filter_params,
                        limit=limit,
                        offset=offset,
                    )
            
            _output_fasta(result.data, output)
        else:
            with console.status("Searching sequences..."):
                result = lapis_client.get_sample_details(
                    organism=organism,
                    filters=filter_params,
                    limit=limit,
                    offset=offset,
                    fields=field_list,
                )
            
            _output_data(result.data, output_format, output, fields)
        
    except Exception as e:
        console.print(f"[bold red]✗ Search failed:[/bold red] {e}")
        raise click.ClickException(str(e))
    finally:
        if lapis_client:
            lapis_client.close()


@get_group.command()
@click.option(
    "--organism",
    "-o",
    required=True,
    help="Organism name (e.g., 'Mpox', 'H5N1')",
)
@click.option(
    "--accession",
    "-a",
    required=True,
    help="Accession.version (e.g., LOC_0000001.1)",
)
@click.option(
    "--format",
    "output_format",
    type=click.Choice(["table", "json"]),
    default="table",
    help="Output format",
)
@click.pass_context
def details(
    ctx: click.Context,
    organism: str,
    accession: str,
    output_format: str,
) -> None:
    """Get detailed information about a specific sequence."""
    instance = ctx.obj.get("instance")
    instance_config = get_instance_config(instance)
    
    lapis_url = instance_config.get_lapis_url(organism)
    lapis_client = LapisClient(lapis_url)
    
    try:
        # Parse accession
        if "." in accession:
            acc, version = accession.split(".", 1)
            filters = {"accession": acc, "version": version}
        else:
            filters = {"accession": accession}
        
        with console.status("Fetching sequence details..."):
            result = lapis_client.get_sample_details(
                organism=organism,
                filters=filters,
                limit=1,
            )
        
        if not result.data:
            console.print(f"[bold red]✗ Sequence not found:[/bold red] {accession}")
            raise click.ClickException(f"Sequence not found: {accession}")
        
        sequence_data = result.data[0]
        
        if output_format == "json":
            console.print(json.dumps(sequence_data, indent=2))
        else:
            _display_details_table(sequence_data)
        
    except click.ClickException:
        raise
    except Exception as e:
        console.print(f"[bold red]✗ Failed to get details:[/bold red] {e}")
        raise click.ClickException(str(e))
    finally:
        if lapis_client:
            lapis_client.close()


@get_group.command()
@click.option(
    "--organism",
    "-o",
    required=True,
    help="Organism name (use 'loculus schema organisms' to see available)",
)
@click.option(
    "--group-by",
    help="Fields to group by (comma-separated)",
)
@click.option(
    "--filter",
    "filters",
    multiple=True,
    help="Filter by metadata field (e.g., 'geoLocCountry=USA')",
)
@click.option(
    "--format",
    "output_format",
    type=click.Choice(["table", "json", "tsv"]),
    default="table",
    help="Output format",
)
@click.option(
    "--output",
    "-f",
    type=click.Path(path_type=Path),
    help="Output file path (default: stdout)",
)
@click.pass_context
def stats(
    ctx: click.Context,
    organism: str,
    group_by: Optional[str],
    filters: List[str],
    output_format: str,
    output: Optional[Path],
) -> None:
    """Get aggregated statistics."""
    instance = ctx.obj.get("instance")
    instance_config = get_instance_config(instance)
    
    try:
        # Get LAPIS URL for this organism
        lapis_url = instance_config.get_lapis_url(organism)
        lapis_client = LapisClient(lapis_url)
        
        # Parse and validate filters using schema
        filter_params = {}
        if filters:
            try:
                metadata_filter = MetadataFilter(instance_config, organism)
                filter_params = metadata_filter.parse_filters(filters)
            except ValueError as e:
                console.print(f"[red]Filter error: {e}[/red]")
                raise click.ClickException(str(e))
        
        # Parse group by
        group_by_list = None
        if group_by:
            group_by_list = [f.strip() for f in group_by.split(",")]
        
        with console.status("Fetching statistics..."):
            result = lapis_client.get_aggregated_data(
                organism=organism,
                filters=filter_params,
                group_by=group_by_list,
            )
        
        _output_data(result.data, output_format, output, None)
        
    except Exception as e:
        console.print(f"[bold red]✗ Stats query failed:[/bold red] {e}")
        raise click.ClickException(str(e))
    finally:
        if lapis_client:
            lapis_client.close()


@get_group.command()
@click.option(
    "--organism",
    "-o",
    required=True,
    help="Organism name (e.g., 'Mpox', 'H5N1')",
)
@click.option(
    "--format",
    "output_format",
    type=click.Choice(["ndjson", "json"]),
    default="ndjson",
    help="Output format",
)
@click.option(
    "--output",
    "-f",
    type=click.Path(path_type=Path),
    help="Output file path (default: stdout)",
)
@click.option(
    "--compression",
    type=click.Choice(["zstd", "gzip", "none"]),
    default="zstd",
    help="Compression format",
)
@click.pass_context
def all(
    ctx: click.Context,
    organism: str,
    output_format: str,
    output: Optional[Path],
    compression: str,
) -> None:
    """Download all released data for an organism."""
    instance = ctx.obj.get("instance")
    instance_config = get_instance_config(instance)
    
    auth_client = AuthClient(instance_config)
    backend_client = BackendClient(instance_config, auth_client)
    
    try:
        with console.status("Downloading all data..."):
            data = backend_client.get_released_data(
                organism=organism,
                compression=compression,
            )
        
        # Write to file or stdout
        if output:
            with open(output, "wb") as f:
                f.write(data)
            console.print(f"✓ Data saved to [bold green]{output}[/bold green]")
        else:
            # Write to stdout
            click.echo(data.decode("utf-8"))
        
    except Exception as e:
        console.print(f"[bold red]✗ Download failed:[/bold red] {e}")
        raise click.ClickException(str(e))
    finally:
        backend_client.close()


def _output_data(
    data: List[Dict[str, Any]],
    output_format: str,
    output: Optional[Path],
    fields: Optional[str],
) -> None:
    """Output data in the specified format."""
    if not data:
        console.print("[bold yellow]No data found[/bold yellow]")
        return
    
    # Filter fields if specified
    if fields:
        field_list = [f.strip() for f in fields.split(",")]
        filtered_data = []
        for item in data:
            filtered_item = {k: v for k, v in item.items() if k in field_list}
            filtered_data.append(filtered_item)
        data = filtered_data
    
    if output_format == "json":
        output_text = json.dumps(data, indent=2)
    elif output_format == "ndjson":
        output_text = "\n".join(json.dumps(item) for item in data)
    elif output_format == "tsv":
        if not data:
            output_text = ""
        else:
            import csv
            import io
            
            output_buffer = io.StringIO()
            writer = csv.DictWriter(output_buffer, fieldnames=data[0].keys(), delimiter="\t")
            writer.writeheader()
            writer.writerows(data)
            output_text = output_buffer.getvalue()
    else:  # table
        if output:
            # For file output, use TSV format
            import csv
            import io
            
            output_buffer = io.StringIO()
            writer = csv.DictWriter(output_buffer, fieldnames=data[0].keys(), delimiter="\t")
            writer.writeheader()
            writer.writerows(data)
            output_text = output_buffer.getvalue()
        else:
            # Display table in console
            _display_data_table(data)
            return
    
    # Write to file or stdout
    if output:
        with open(output, "w") as f:
            f.write(output_text)
        console.print(f"✓ Data saved to [bold green]{output}[/bold green]")
    else:
        click.echo(output_text)


def _output_fasta(data: List[Dict[str, str]], output: Optional[Path]) -> None:
    """Output sequence data in FASTA format."""
    if not data:
        console.print("[bold yellow]No sequences found[/bold yellow]")
        return
    
    fasta_lines = []
    for item in data:
        # Look for sequence fields
        sequence = item.get("sequence") or item.get("alignedNucleotideSequence") or item.get("unalignedNucleotideSequence")
        if sequence:
            accession = item.get("accession", "unknown")
            version = item.get("version", "1")
            header = f">{accession}.{version}"
            fasta_lines.append(header)
            fasta_lines.append(sequence)
    
    output_text = "\n".join(fasta_lines)
    
    if output:
        with open(output, "w") as f:
            f.write(output_text)
        console.print(f"✓ Sequences saved to [bold green]{output}[/bold green]")
    else:
        click.echo(output_text)


def _display_data_table(data: List[Dict[str, Any]]) -> None:
    """Display data as a table in the console."""
    if not data:
        return
    
    table = Table()
    
    # Add columns
    for key in data[0].keys():
        table.add_column(key, style="cyan")
    
    # Add rows
    for item in data:
        row = [str(item.get(key, "")) for key in data[0].keys()]
        table.add_row(*row)
    
    console.print(table)


def _display_details_table(data: Dict[str, Any]) -> None:
    """Display detailed information as a table."""
    table = Table(title="Sequence Details")
    table.add_column("Field", style="green")
    table.add_column("Value", style="blue")
    
    for key, value in data.items():
        table.add_row(key, str(value))
    
    console.print(table)