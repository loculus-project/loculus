"""Status command for monitoring sequence submissions."""

import io
import json
import time

import click
from rich.console import Console
from rich.live import Live

from ..api.backend import BackendClient
from ..api.models import ProcessingResult, SequenceStatus
from ..auth.client import AuthClient
from ..config import get_instance_config
from ..utils.guards import require_instance, require_organism
from ..utils.review_utils import (
    filter_sequences,
    format_sequence_summary,
    format_sequence_table,
)

console = Console()


@click.command(name="status")
@click.option(
    "--status",
    type=click.Choice([s.value for s in SequenceStatus]),
    help="Filter by processing status",
)
@click.option(
    "--result",
    type=click.Choice([r.value for r in ProcessingResult]),
    help="Filter by processing result",
)
@click.option("--group", "-g", type=int, help="Filter by specific group ID")
@click.option("--accession", help="Show specific sequence by accession")
@click.option("--version", type=int, help="Specify version (used with --accession)")
@click.option("--summary", is_flag=True, help="Show only summary counts")
@click.option(
    "--detailed",
    is_flag=True,
    help="Show detailed information including errors/warnings",
)
@click.option(
    "--format",
    "output_format",
    type=click.Choice(["table", "json"]),
    default="table",
    help="Output format",
)
@click.option("--limit", type=int, default=50, help="Limit number of results")
@click.option("--page", type=int, default=1, help="Page number for pagination")
@click.option("--watch", is_flag=True, help="Continuously monitor status")
@click.option("--watch-interval", type=int, default=2, help="Watch interval in seconds")
@click.option("--errors-only", is_flag=True, help="Show only sequences with errors")
@click.option("--warnings-only", is_flag=True, help="Show only sequences with warnings")
@click.option("--ready", is_flag=True, help="Show sequences ready for release")
@click.option("--pending", is_flag=True, help="Show unprocessed sequences")
@click.pass_context
def status(
    ctx: click.Context,
    status: str | None,
    result: str | None,
    group: int | None,
    accession: str | None,
    version: int | None,
    summary: bool,
    detailed: bool,
    output_format: str,
    limit: int,
    page: int,
    watch: bool,
    watch_interval: int,
    errors_only: bool,
    warnings_only: bool,
    ready: bool,
    pending: bool,
) -> None:
    """Show status of submitted sequences."""
    instance = require_instance(ctx, ctx.obj.get("instance"))
    config = get_instance_config(instance)
    auth_client = AuthClient(config)
    console = Console()

    current_user = auth_client.get_current_user()
    if not current_user:
        console.print(
            "[red]Not authenticated. Please run 'loculus auth login' first.[/red]"
        )
        raise click.Abort()

    api_client = BackendClient(config, auth_client)

    # Get organism with default (required for status)
    organism = require_organism(instance, ctx.obj.get("organism"))

    # Get group with default (optional)
    # Prefer explicit command option over top-level default when provided.
    context_group = ctx.obj.get("group")
    if group is None:
        group = context_group

    # Validate options
    if accession and not version:
        version = 1  # Default to version 1 if not specified

    if accession and (summary or watch):
        console.print("[red]Cannot use --accession with --summary or --watch[/red]")
        raise click.Abort()

    # Convert string options to enums
    status_filter = SequenceStatus(status) if status else None
    result_filter = ProcessingResult(result) if result else None

    def fetch_and_display() -> bool:
        """Fetch and display sequence data."""
        try:
            if accession:
                # Show detailed info for specific sequence
                seq_version = version if version is not None else 1
                show_sequence_details(
                    api_client,
                    current_user,
                    organism,
                    accession,
                    seq_version,
                    console,
                )
                return True
            else:
                # Show list of sequences
                show_sequences_list(
                    api_client=api_client,
                    username=current_user,
                    organism=organism,
                    status_filter=status_filter,
                    result_filter=result_filter,
                    group=group,
                    summary=summary,
                    detailed=detailed,
                    output_format=output_format,
                    limit=limit,
                    page=page,
                    errors_only=errors_only,
                    warnings_only=warnings_only,
                    ready=ready,
                    pending=pending,
                    console=console,
                )
                return True
        except Exception as e:
            console.print(f"[red]Error: {e}[/red]")
            return False

    if watch:
        # Watch mode with live updates
        console.print(f"[blue]Monitoring {organism} sequences (Ctrl+C to stop)[/blue]")
        console.print(f"[dim]Refreshing every {watch_interval} seconds[/dim]")
        console.print()

        with Live(refresh_per_second=1) as live:
            while True:
                try:
                    content = get_display_content(
                        api_client=api_client,
                        username=current_user,
                        organism=organism,
                        status_filter=status_filter,
                        result_filter=result_filter,
                        group=group,
                        summary=summary,
                        output_format=output_format,
                        limit=limit,
                        page=page,
                        errors_only=errors_only,
                        warnings_only=warnings_only,
                        ready=ready,
                        pending=pending,
                    )
                    live.update(content)
                    time.sleep(watch_interval)
                except KeyboardInterrupt:
                    console.print("\n[yellow]Monitoring stopped[/yellow]")
                    break
                except Exception as e:
                    live.update(f"[red]Error: {e}[/red]")
                    time.sleep(watch_interval)
    else:
        # Single fetch and display
        success = fetch_and_display()
        if not success:
            raise click.Abort()


def show_sequence_details(
    api_client: BackendClient,
    username: str,
    organism: str,
    accession: str,
    version: int,
    console: Console,
) -> bool:
    """Show detailed information for a specific sequence."""
    try:
        details = api_client.get_review_sequence_details(
            username, organism, accession, version
        )

        console.print(f"[bold]Sequence: {accession}.{version}[/bold]")
        console.print(f"Status: {details['status']}")
        console.print(f"Submission ID: {details['submissionId']}")
        console.print(f"Group ID: {details['groupId']}")
        console.print()

        # Show errors if present
        if details.get("errors"):
            console.print("[red bold]Errors:[/red bold]")
            for error in details["errors"]:
                field_names = ", ".join(
                    field["name"] for field in error["processedFields"]
                )
                console.print(f"  [red]{field_names}: {error['message']}[/red]")
            console.print()

        # Show warnings if present
        if details.get("warnings"):
            console.print("[yellow bold]Warnings:[/yellow bold]")
            for warning in details["warnings"]:
                field_names = ", ".join(
                    field["name"] for field in warning["processedFields"]
                )
                console.print(f"  [yellow]{field_names}: {warning['message']}[/yellow]")
            console.print()

        # Show metadata
        if details.get("processedData", {}).get("metadata"):
            console.print("[bold]Metadata:[/bold]")
            for key, value in details["processedData"]["metadata"].items():
                if value is not None:
                    console.print(f"  {key}: {value}")

        return True
    except Exception as e:
        console.print(
            f"[red]Failed to fetch details for {accession}.{version}: {e}[/red]"
        )
        return False


def show_sequences_list(
    api_client: BackendClient,
    username: str,
    organism: str,
    status_filter: SequenceStatus | None,
    result_filter: ProcessingResult | None,
    group: int | None,
    summary: bool,
    detailed: bool,
    output_format: str,
    limit: int,
    page: int,
    errors_only: bool,
    warnings_only: bool,
    ready: bool,
    pending: bool,
    console: Console,
) -> bool:
    """Show list of sequences with filtering."""
    try:
        # Build filters for API
        statuses = [status_filter] if status_filter else None
        results = [result_filter] if result_filter else None
        group_ids = [group] if group else None

        # Fetch sequences
        response = api_client.get_review_sequences(
            username=username,
            organism=organism,
            group_ids=group_ids,
            statuses=statuses,
            results=results,
            page=page - 1,  # Convert to 0-indexed
            size=limit,
        )

        # Apply client-side filters
        filtered_sequences = filter_sequences(
            response.sequence_entries,
            errors_only=errors_only,
            warnings_only=warnings_only,
            ready_only=ready,
            pending_only=pending,
        )

        if summary:
            # Show summary
            summary_text = format_sequence_summary(response)
            if output_format == "json":
                summary_data = {
                    "total": response.total_count,
                    "ready": response.ready_count,
                    "errors": response.error_count,
                    "status_counts": response.status_counts,
                    "processing_result_counts": response.processing_result_counts,
                }
                # Print JSON without rich formatting to avoid color codes
                print(json.dumps(summary_data, indent=2))
            else:
                console.print(summary_text)
        else:
            # Show table or JSON
            if output_format == "json":
                sequences_data = []
                for seq in filtered_sequences:
                    sequences_data.append(
                        {
                            "accession": seq.accession,
                            "version": seq.version,
                            "status": seq.status.value,
                            "processing_result": (
                                seq.processing_result.value
                                if seq.processing_result
                                else None
                            ),
                            "submission_id": seq.submission_id,
                            "submitter": seq.submitter,
                            "group_id": seq.group_id,
                            "data_use_terms": seq.data_use_terms,
                            "is_revocation": seq.is_revocation,
                        }
                    )
                # Print JSON without rich formatting to avoid color codes
                print(json.dumps(sequences_data, indent=2))
            else:
                if not filtered_sequences:
                    console.print(
                        "[yellow]No sequences found matching the criteria[/yellow]"
                    )
                else:
                    table = format_sequence_table(filtered_sequences, detailed=detailed)
                    console.print(table)

                    # Show summary line
                    console.print()
                    console.print(
                        f"[dim]Showing {len(filtered_sequences)} sequences "
                        f"(page {page}, limit {limit})[/dim]"
                    )

        return True
    except Exception as e:
        console.print(f"[red]Failed to fetch sequences: {e}[/red]")
        return False


def get_display_content(
    api_client: BackendClient,
    username: str,
    organism: str,
    status_filter: SequenceStatus | None,
    result_filter: ProcessingResult | None,
    group: int | None,
    summary: bool,
    output_format: str,
    limit: int,
    page: int,
    errors_only: bool,
    warnings_only: bool,
    ready: bool,
    pending: bool,
) -> str:
    """Get display content for watch mode."""
    try:
        # Build filters for API
        statuses = [status_filter] if status_filter else None
        results = [result_filter] if result_filter else None
        group_ids = [group] if group else None

        # Fetch sequences
        response = api_client.get_review_sequences(
            username=username,
            organism=organism,
            group_ids=group_ids,
            statuses=statuses,
            results=results,
            page=page - 1,
            size=limit,
        )

        # Apply client-side filters
        filtered_sequences = filter_sequences(
            response.sequence_entries,
            errors_only=errors_only,
            warnings_only=warnings_only,
            ready_only=ready,
            pending_only=pending,
        )

        if summary:
            return format_sequence_summary(response)
        else:
            if not filtered_sequences:
                return "[yellow]No sequences found matching the criteria[/yellow]"
            else:
                table = format_sequence_table(filtered_sequences, detailed=False)
                console = Console(file=io.StringIO(), width=120)
                with console.capture() as capture:
                    console.print(table)
                return capture.get()
    except Exception as e:
        return f"[red]Error: {e}[/red]"
