"""Release command for approving sequences for public access."""

import click
from rich.console import Console
from rich.prompt import Confirm
from rich.table import Table

from ..api.backend import BackendClient
from ..api.models import ProcessingResult, SequenceEntry, SequenceStatus
from ..auth.client import AuthClient
from ..config import get_instance_config
from ..utils.guards import require_instance, require_organism

console = Console()


@click.command(name="release")
@click.option("--accession", help="Release specific sequence by accession")
@click.option("--version", type=int, help="Sequence version (default: 1)")
@click.option(
    "--group", "-g", type=int, help="Release sequences from specific group only"
)
@click.option("--all-valid", is_flag=True, help="Release all sequences without errors")
@click.option(
    "--no-warnings-only", is_flag=True, help="Release only sequences with no issues"
)
@click.option(
    "--filter-status",
    type=click.Choice([s.value for s in SequenceStatus]),
    help="Filter by status before release",
)
@click.option(
    "--filter-result",
    type=click.Choice([r.value for r in ProcessingResult]),
    help="Filter by result before release",
)
@click.option(
    "--dry-run", is_flag=True, help="Show what would be released without releasing"
)
@click.option("--force", is_flag=True, help="Skip confirmation prompts")
@click.option("--quiet", is_flag=True, help="Minimal output (only errors)")
@click.option("--verbose", is_flag=True, help="Detailed output")
@click.pass_context
def release(
    ctx: click.Context,
    accession: str | None,
    version: int | None,
    group: int | None,
    all_valid: bool,
    no_warnings_only: bool,
    filter_status: str | None,
    filter_result: str | None,
    dry_run: bool,
    force: bool,
    quiet: bool,
    verbose: bool,
) -> None:
    """Release sequences for public access."""
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

    # Get organism with default (required for release)
    organism = require_organism(instance, ctx.obj.get("organism"))

    # Get group with default (optional)
    # Group is optional for release command - use top-level default only when
    # the command did not specify one explicitly.
    context_group = ctx.obj.get("group")
    if group is None:
        group = context_group

    # Validate options
    if accession and not version:
        version = 1  # Default to version 1

    if accession and (all_valid or no_warnings_only):
        console.print("[red]Cannot use --accession with bulk release options[/red]")
        raise click.Abort()

    if all_valid and no_warnings_only:
        console.print("[red]Cannot use both --all-valid and --no-warnings-only[/red]")
        raise click.Abort()

    if not accession and not all_valid and not no_warnings_only:
        console.print(
            "[red]Must specify either --accession, --all-valid, "
            "or --no-warnings-only[/red]"
        )
        raise click.Abort()

    # Convert string options to enums
    status_filter = SequenceStatus(filter_status) if filter_status else None
    result_filter = ProcessingResult(filter_result) if filter_result else None

    try:
        if accession:
            # Release specific sequence
            if version is None:
                version = 1  # Default version
            success = release_specific_sequence(
                api_client,
                current_user,
                organism,
                accession,
                version,
                group,
                dry_run,
                force,
                quiet,
                verbose,
                console,
            )
        else:
            # Bulk release
            success = release_bulk_sequences(
                api_client,
                current_user,
                organism,
                group,
                all_valid,
                no_warnings_only,
                status_filter,
                result_filter,
                dry_run,
                force,
                quiet,
                verbose,
                console,
            )

        if not success:
            raise click.Abort()
    except Exception as e:
        console.print(f"[red]Release failed: {e}[/red]")
        raise click.Abort() from e


def release_specific_sequence(
    api_client: BackendClient,
    username: str,
    organism: str,
    accession: str,
    version: int,
    group: int | None,
    dry_run: bool,
    force: bool,
    quiet: bool,
    verbose: bool,
    console: Console,
) -> bool:
    """Release a specific sequence."""
    if not quiet:
        console.print(f"[blue]Preparing to release {accession}.{version}[/blue]")

    # Get sequence details to verify it can be released
    try:
        response = api_client.get_review_sequences(
            username=username,
            organism=organism,
            group_ids=[group] if group else None,
            page=0,
            size=1000,  # Get enough to find our sequence
        )

        # Find the specific sequence
        target_seq = None
        for seq in response.sequence_entries:
            if seq.accession == accession and seq.version == version:
                target_seq = seq
                break

        if not target_seq:
            console.print(f"[red]Sequence {accession}.{version} not found[/red]")
            return False

        if not target_seq.is_ready_for_release:
            if target_seq.has_errors:
                console.print(
                    f"[red]Cannot release {accession}.{version}: has errors[/red]"
                )
            elif target_seq.is_pending:
                console.print(
                    f"[red]Cannot release {accession}.{version}: still processing[/red]"
                )
            else:
                console.print(
                    f"[red]Cannot release {accession}.{version}: not ready[/red]"
                )
            return False

        if group and target_seq.group_id != group:
            console.print(
                f"[red]Sequence {accession}.{version} belongs to group "
                f"{target_seq.group_id}, not {group}[/red]"
            )
            return False

        # Show what will be released
        if dry_run or verbose or not quiet:
            show_release_preview([target_seq], console)

        if dry_run:
            console.print(
                "[blue]Dry run complete. Use --confirm or remove "
                "--dry-run to proceed.[/blue]"
            )
            return True

        # Confirm release
        if not force:
            if not Confirm.ask(f"Release {accession}.{version} for public access?"):
                console.print("[yellow]Release cancelled[/yellow]")
                return False

        # Perform release
        group_ids = [target_seq.group_id]
        accession_versions = [{"accession": accession, "version": version}]

        api_client.approve_sequences_for_release(
            username=username,
            organism=organism,
            group_ids=group_ids,
            accession_versions=accession_versions,
            scope="ALL",
        )

        if not quiet:
            console.print(
                f"[green]✓ Successfully released {accession}.{version}[/green]"
            )

        return True

    except Exception as e:
        console.print(f"[red]Failed to release {accession}.{version}: {e}[/red]")
        return False


def release_bulk_sequences(
    api_client: BackendClient,
    username: str,
    organism: str,
    group: int | None,
    all_valid: bool,
    no_warnings_only: bool,
    status_filter: SequenceStatus | None,
    result_filter: ProcessingResult | None,
    dry_run: bool,
    force: bool,
    quiet: bool,
    verbose: bool,
    console: Console,
) -> bool:
    """Release multiple sequences based on criteria."""
    if not quiet:
        console.print("[blue]Fetching sequences for bulk release...[/blue]")

    try:
        # Get all sequences that match filters
        response = api_client.get_review_sequences(
            username=username,
            organism=organism,
            group_ids=[group] if group else None,
            statuses=[status_filter] if status_filter else None,
            results=[result_filter] if result_filter else None,
            page=0,
            size=1000,  # Get a large batch
        )

        # Filter sequences for release
        if all_valid:
            releasable = [
                s for s in response.sequence_entries if s.is_ready_for_release
            ]
        elif no_warnings_only:
            releasable = [
                s
                for s in response.sequence_entries
                if s.status == SequenceStatus.PROCESSED
                and s.processing_result == ProcessingResult.NO_ISSUES
            ]
        else:
            # This shouldn't happen due to validation, but just in case
            releasable = []

        if not releasable:
            if not quiet:
                console.print(
                    "[yellow]No sequences found matching release criteria[/yellow]"
                )
            return True

        # Group sequences by group_id for API calls
        sequences_by_group: dict[int, list[SequenceEntry]] = {}
        for seq in releasable:
            if seq.group_id not in sequences_by_group:
                sequences_by_group[seq.group_id] = []
            sequences_by_group[seq.group_id].append(seq)

        # Show what will be released
        if dry_run or verbose or not quiet:
            show_release_preview(releasable, console)

        if dry_run:
            console.print(
                f"[blue]Dry run complete. Would release "
                f"{len(releasable)} sequences.[/blue]"
            )
            console.print(
                "[blue]Remove --dry-run to proceed with actual release.[/blue]"
            )
            return True

        # Confirm bulk release
        if not force:
            scope_desc = (
                "sequences without errors" if all_valid else "sequences with no issues"
            )
            if not Confirm.ask(
                f"Release {len(releasable)} {scope_desc} for public access?"
            ):
                console.print("[yellow]Release cancelled[/yellow]")
                return False

        # Perform bulk release by group
        total_released = 0
        total_failed = 0

        for group_id, group_sequences in sequences_by_group.items():
            try:
                # Determine scope
                scope = "WITHOUT_WARNINGS" if no_warnings_only else "ALL"

                result = api_client.approve_sequences_for_release(
                    username=username,
                    organism=organism,
                    group_ids=[group_id],
                    scope=scope,
                )

                released_count = len(result)
                total_released += released_count

                if verbose:
                    console.print(
                        f"[green]✓ Released {released_count} sequences "
                        f"from group {group_id}[/green]"
                    )

            except Exception as e:
                total_failed += len(group_sequences)
                console.print(
                    f"[red]✗ Failed to release sequences from group "
                    f"{group_id}: {e}[/red]"
                )

        # Summary
        if not quiet:
            if total_failed == 0:
                console.print(
                    f"[green]✓ Successfully released all "
                    f"{total_released} sequences[/green]"
                )
            else:
                console.print(
                    f"[yellow]Released {total_released} sequences, "
                    f"{total_failed} failed[/yellow]"
                )

        return total_failed == 0

    except Exception as e:
        console.print(f"[red]Bulk release failed: {e}[/red]")
        return False


def show_release_preview(sequences: list[SequenceEntry], console: Console) -> None:
    """Show preview of sequences to be released."""
    # Group by processing result
    no_issues = [
        s for s in sequences if s.processing_result == ProcessingResult.NO_ISSUES
    ]
    with_warnings = [
        s for s in sequences if s.processing_result == ProcessingResult.HAS_WARNINGS
    ]

    console.print(f"[bold]Found {len(sequences)} sequences ready for release:[/bold]")
    console.print()

    if no_issues:
        console.print(f"[green]NO_ISSUES ({len(no_issues)} sequences):[/green]")
        table = Table(show_header=False, box=None, padding=(0, 2))
        table.add_column("Accession", style="bold")
        table.add_column("Submission", style="dim")
        table.add_column("Submitter", style="dim")

        for seq in no_issues[:10]:  # Show first 10
            table.add_row(seq.accession_version, seq.submission_id, seq.submitter)

        console.print(table)
        if len(no_issues) > 10:
            console.print(f"[dim]... and {len(no_issues) - 10} more[/dim]")
        console.print()

    if with_warnings:
        console.print(
            f"[yellow]HAS_WARNINGS ({len(with_warnings)} sequences):[/yellow]"
        )
        table = Table(show_header=False, box=None, padding=(0, 2))
        table.add_column("Accession", style="bold")
        table.add_column("Submission", style="dim")
        table.add_column("Submitter", style="dim")

        for seq in with_warnings[:10]:  # Show first 10
            table.add_row(seq.accession_version, seq.submission_id, seq.submitter)

        console.print(table)
        if len(with_warnings) > 10:
            console.print(f"[dim]... and {len(with_warnings) - 10} more[/dim]")
        console.print()
