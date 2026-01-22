"""Get/search commands for Loculus CLI."""

import json
from pathlib import Path
from typing import Any

import click
from rich.console import Console
from rich.table import Table

from ..api.lapis import LapisClient
from ..config import get_instance_config
from ..utils.console import get_stderr_console, handle_cli_error, print_error
from ..utils.guards import require_instance, require_organism
from ..utils.metadata_filter import MetadataFilter

console = Console()


@click.group(name="get")
def get_group() -> None:
    """Search and retrieve sequences."""
    pass


@get_group.command()
@click.option(
    "--filter",
    "filters",
    multiple=True,
    help=(
        "Filter by metadata field (e.g., 'geoLocCountry=USA', "
        "'sampleCollectionDateRangeLower>=2024-01-01'). "
        "Use 'loculus schema show --organism NAME' to see available fields."
    ),
)
@click.option(
    "--accessions",
    help="Comma-separated list of accession.version",
)
@click.option(
    "--limit",
    type=int,
    default=None,
    help="Maximum number of results",
)
@click.option(
    "--offset",
    type=int,
    default=None,
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
@click.option(
    "--segment",
    help="Segment name for multisegmented viruses (e.g., 'L', 'M', 'S' for CCHF)",
)
@click.pass_context
def sequences(
    ctx: click.Context,
    filters: list[str],
    accessions: str | None,
    limit: int,
    offset: int,
    output_format: str,
    output: Path | None,
    fields: str | None,
    aligned: bool,
    segment: str | None,
) -> None:
    """Search and retrieve sequences."""
    instance = require_instance(ctx, ctx.obj.get("instance"))
    instance_config = get_instance_config(instance)

    # Get organism with guard (required for get)
    organism = require_organism(instance, ctx.obj.get("organism"))

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
                console.print(
                    f"Use 'loculus schema show --organism {organism} --help' "
                    "to see available fields"
                )
                raise click.ClickException(str(e)) from e

        # Handle accessions
        if accessions:
            accession_filters = []
            for acc in accessions.split(","):
                acc = acc.strip()
                if "." in acc:
                    accession, version = acc.split(".", 1)
                    accession_filters.append(
                        {"accession": accession, "version": version}
                    )
                else:
                    accession_filters.append({"accession": acc})

            # Query LAPIS for each accession
            all_data = []
            stderr_console = get_stderr_console()
            with stderr_console.status("Fetching sequences..."):
                for acc_filter in accession_filters:
                    result = lapis_client.get_sample_details(
                        organism=organism,
                        filters=acc_filter,
                        limit=1000,  # Should be enough for all versions
                    )
                    all_data.extend(result.data)

            # Get schema for table display
            schema = instance_config.get_organism_schema(organism)
            _output_data(all_data, output_format, output, fields, dict(schema))
            return

        # Parse fields
        field_list = None
        if fields:
            field_list = [f.strip() for f in fields.split(",")]

        # Get organism schema to check for segments
        schema = instance_config.get_organism_schema(organism)

        # Get nucleotide segment names from referenceGenomes
        # Format: list of segments, each with "name" and "references"
        instance_info = instance_config.instance_info.get_info()
        organism_info = instance_info["organisms"].get(organism, {})
        ref_genomes = organism_info.get("referenceGenomes", [])

        nucleotide_sequences = [segment["name"] for segment in ref_genomes]
        if not nucleotide_sequences:
            raise ValueError("No nucleotide sequences defined in config")

        # Check if all segments have only one reference (single reference mode)
        is_single_reference = all(
            len(segment.get("references", [])) == 1 for segment in ref_genomes
        )

        # Handle segment parameter for multisegmented viruses
        if output_format == "fasta":
            # Check if organism has multiple segments
            if len(nucleotide_sequences) > 1 and not segment:
                available_segments = ", ".join(nucleotide_sequences)
                console.print(
                    f"[red]Error: Organism '{organism}' has multiple segments. "
                    f"Please specify --segment option.[/red]"
                )
                console.print(
                    f"[yellow]Available segments: {available_segments}[/yellow]"
                )
                raise click.ClickException(
                    f"Segment required for multisegmented organism '{organism}'"
                )

            # Validate segment if provided
            if segment:
                if segment not in nucleotide_sequences:
                    available_segments = ", ".join(nucleotide_sequences)
                    console.print(
                        f"[red]Error: Segment '{segment}' not found for organism "
                        f"'{organism}'.[/red]"
                    )
                    console.print(
                        f"[yellow]Available segments: {available_segments}[/yellow]"
                    )
                    raise click.ClickException(
                        f"Invalid segment '{segment}' for organism '{organism}'"
                    )

            should_omit_segment = is_single_reference and len(nucleotide_sequences) == 1
            segment_name = None if should_omit_segment else segment

            stderr_console = get_stderr_console()
            with stderr_console.status("Fetching sequences..."):
                if aligned:
                    seq_result = lapis_client.get_aligned_sequences(
                        organism=organism,
                        segment=segment_name,
                        filters=filter_params,
                        limit=limit,
                        offset=offset,
                    )
                else:
                    seq_result = lapis_client.get_unaligned_sequences(
                        organism=organism,
                        segment=segment_name,
                        filters=filter_params,
                        limit=limit,
                        offset=offset,
                    )

            _output_fasta(seq_result.data, output)
        else:
            stderr_console = get_stderr_console()
            with stderr_console.status("Searching sequences..."):
                data_result = lapis_client.get_sample_details(
                    organism=organism,
                    filters=filter_params,
                    limit=limit,
                    offset=offset,
                    fields=field_list,
                )

            # Use schema already retrieved above
            _output_data(data_result.data, output_format, output, fields, dict(schema))

    except Exception as e:
        handle_cli_error("Search failed", e)
    finally:
        if lapis_client:
            lapis_client.close()


@get_group.command()
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
    accession: str,
    output_format: str,
) -> None:
    """Get detailed information about a specific sequence."""
    instance = require_instance(ctx, ctx.obj.get("instance"))
    instance_config = get_instance_config(instance)

    # Get organism with guard (required for details)
    organism = require_organism(instance, ctx.obj.get("organism"))

    lapis_url = instance_config.get_lapis_url(organism)
    lapis_client = LapisClient(lapis_url)

    try:
        # Parse accession
        if "." in accession:
            acc, version = accession.split(".", 1)
            filters = {"accession": acc, "version": version}
        else:
            filters = {"accession": accession}

        stderr_console = get_stderr_console()
        with stderr_console.status("Fetching sequence details..."):
            result = lapis_client.get_sample_details(
                organism=organism,
                filters=filters,
                limit=1,
            )

        if not result.data:
            print_error(f"Sequence not found: {accession}")
            raise click.ClickException(f"Sequence not found: {accession}")

        sequence_data = result.data[0]

        if output_format == "json":
            console.print(json.dumps(sequence_data, indent=2))
        else:
            _display_details_table(sequence_data)

    except click.ClickException:
        raise
    except Exception as e:
        handle_cli_error("Failed to get details", e)
    finally:
        if lapis_client:
            lapis_client.close()


@get_group.command()
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
    group_by: str | None,
    filters: list[str],
    output_format: str,
    output: Path | None,
) -> None:
    """Get aggregated statistics."""
    instance = require_instance(ctx, ctx.obj.get("instance"))
    instance_config = get_instance_config(instance)

    # Get organism with guard (required for stats)
    organism = require_organism(instance, ctx.obj.get("organism"))

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
                raise click.ClickException(str(e)) from e

        # Parse group by
        group_by_list = None
        if group_by:
            group_by_list = [f.strip() for f in group_by.split(",")]

        stderr_console = get_stderr_console()
        with stderr_console.status("Fetching statistics..."):
            result = lapis_client.get_aggregated_data(
                organism=organism,
                filters=filter_params,
                group_by=group_by_list,
            )

        # Get schema for table display
        schema = instance_config.get_organism_schema(organism)
        _output_data(result.data, output_format, output, None, dict(schema))

    except Exception as e:
        handle_cli_error("Stats query failed", e)
    finally:
        if lapis_client:
            lapis_client.close()


def _output_data(
    data: list[dict[str, Any]],
    output_format: str,
    output: Path | None,
    fields: str | None,
    schema: dict[str, Any],
) -> None:
    """Output data in the specified format."""
    if not data:
        # For JSON formats, return empty array instead of text message
        if output_format in ["json", "ndjson"]:
            output_text = "[]" if output_format == "json" else ""
            if output:
                with open(output, "w") as f:
                    f.write(output_text)
                console.print(f"✓ Data saved to [bold green]{output}[/bold green]")
            else:
                click.echo(output_text)
        else:
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
            writer = csv.DictWriter(
                output_buffer, fieldnames=data[0].keys(), delimiter="\t"
            )
            writer.writeheader()
            writer.writerows(data)
            output_text = output_buffer.getvalue()
    else:  # table
        if output:
            # For file output, use TSV format
            import csv
            import io

            output_buffer = io.StringIO()
            writer = csv.DictWriter(
                output_buffer, fieldnames=data[0].keys(), delimiter="\t"
            )
            writer.writeheader()
            writer.writerows(data)
            output_text = output_buffer.getvalue()
        else:
            # Display table in console
            _display_data_table(data, schema)
            return

    # Write to file or stdout
    if output:
        with open(output, "w") as f:
            f.write(output_text)
        console.print(f"✓ Data saved to [bold green]{output}[/bold green]")
    else:
        click.echo(output_text)


def _output_fasta(data: list[dict[str, str]], output: Path | None) -> None:
    """Output sequence data in FASTA format."""
    if not data:
        console.print("[bold yellow]No sequences found[/bold yellow]")
        return

    fasta_lines = []
    for item in data:
        # Look for sequence fields
        sequence = (
            item.get("sequence")
            or item.get("alignedNucleotideSequence")
            or item.get("unalignedNucleotideSequence")
        )
        if sequence:
            header = f">{item['accessionVersion']}"
            fasta_lines.append(header)
            fasta_lines.append(sequence)

    output_text = "\n".join(fasta_lines)

    if output:
        with open(output, "w") as f:
            f.write(output_text)
        console.print(f"✓ Sequences saved to [bold green]{output}[/bold green]")
    else:
        click.echo(output_text)


def _display_data_table(data: list[dict[str, Any]], schema: dict[str, Any]) -> None:
    """Display data as a table in the console."""
    if not data:
        return

    table = Table(show_lines=False)

    # Get terminal width for intelligent column sizing
    terminal_width = console.size.width

    # Get all available columns
    all_columns = list(data[0].keys())

    # Use tableColumns from schema
    key_columns = schema["tableColumns"]

    # Prioritize columns: accessionVersion first, then tableColumns, then others
    columns_to_show = []

    # Always show accessionVersion first if it exists
    if "accessionVersion" in all_columns:
        columns_to_show.append("accessionVersion")

    # Add key columns from schema (skip accessionVersion if already added)
    for col in key_columns:
        if col in all_columns and col not in columns_to_show:
            columns_to_show.append(col)

    # Add remaining columns
    for col in all_columns:
        if col not in columns_to_show:
            columns_to_show.append(col)

    # Calculate maximum width per column (rough estimate)
    max_columns = max(1, terminal_width // 15)  # Assume ~15 chars per column minimum

    # Limit the number of columns to show
    if len(columns_to_show) > max_columns:
        shown_columns = columns_to_show[:max_columns]
        hidden_count = len(columns_to_show) - max_columns
        console.print(
            f"[dim]Showing {len(shown_columns)} of {len(all_columns)} columns. "
            f"Use --fields to specify columns or --format json for all data.[/dim]"
        )
    else:
        shown_columns = columns_to_show
        hidden_count = 0

    # Add columns with intelligent width limits
    for key in shown_columns:
        # Calculate max content width for this column
        max_content_width = max(len(str(item.get(key, ""))) for item in data)
        max_content_width = max(max_content_width, len(key))  # Include header width

        # Set reasonable width limits
        if max_content_width > 30:
            # For very wide columns, truncate
            table.add_column(key, style="cyan", max_width=30, overflow="ellipsis")
        elif max_content_width > 20:
            # For moderately wide columns, set a reasonable limit
            table.add_column(key, style="cyan", max_width=25, overflow="ellipsis")
        else:
            # For narrow columns, use natural width
            table.add_column(key, style="cyan")

    # Add rows with truncation for very long values
    for item in data:
        row = []
        for key in shown_columns:
            value = str(item.get(key, ""))
            # Truncate extremely long values
            if len(value) > 20:
                value = value[:17] + "..."
            row.append(value)
        table.add_row(*row)

    console.print(table)

    # Show hint if columns were hidden
    if hidden_count > 0:
        console.print(
            f"[dim]Use --format json to see all {len(all_columns)} columns[/dim]"
        )


def _display_details_table(data: dict[str, Any]) -> None:
    """Display detailed information as a table."""
    table = Table(title="Sequence Details")
    table.add_column("Field", style="green")
    table.add_column("Value", style="blue")

    for key, value in data.items():
        table.add_row(key, str(value))

    console.print(table)
