"""Shared utilities for review-related CLI commands (status and release)."""

from rich.table import Table
from rich.text import Text

from ..api.models import (
    ProcessingResult,
    SequenceEntry,
    SequencesResponse,
    SequenceStatus,
)

__all__ = [
    "ProcessingResult",
    "SequenceEntry",
    "SequenceStatus",
    "SequencesResponse",
    "filter_sequences",
    "format_sequence_summary",
    "format_sequence_table",
]


def format_sequence_table(
    sequences: list[SequenceEntry], detailed: bool = False
) -> Table:
    """Format sequences as a rich table."""
    table = Table(show_header=True, header_style="bold magenta")

    table.add_column("Status", style="dim", width=12)
    table.add_column("Result", width=12)
    table.add_column("Accession", style="bold")
    table.add_column("Version", justify="right", width=8)
    table.add_column("Submission ID", width=15)
    table.add_column("Data Use", width=10)
    table.add_column("Submitter", style="dim")

    for seq in sequences:
        # Status styling
        status_style = {
            SequenceStatus.RECEIVED: "yellow",
            SequenceStatus.IN_PROCESSING: "blue",
            SequenceStatus.PROCESSED: "green",
            SequenceStatus.APPROVED_FOR_RELEASE: "green bold",
        }.get(seq.status, "")

        # Result styling
        result_text = seq.processing_result.value if seq.processing_result else "-"
        result_style = (
            {
                ProcessingResult.NO_ISSUES: "green",
                ProcessingResult.HAS_WARNINGS: "yellow",
                ProcessingResult.HAS_ERRORS: "red",
            }.get(seq.processing_result, "dim")
            if seq.processing_result
            else "dim"
        )

        # Data use terms display
        data_use = seq.data_use_terms.get("type", "UNKNOWN")
        if data_use == "RESTRICTED":
            data_use = "RESTRICTED"

        table.add_row(
            Text(seq.status.value, style=status_style),
            Text(result_text, style=result_style),
            seq.accession,
            str(seq.version),
            seq.submission_id,
            data_use,
            seq.submitter,
        )

    return table


def format_sequence_summary(response: SequencesResponse) -> str:
    """Format summary statistics."""
    lines = []
    lines.append(f"Total: {response.total_count} sequences")
    lines.append("")

    lines.append("Processing Status:")
    for status in SequenceStatus:
        count = response.status_counts.get(status.value, 0)
        if count > 0:
            lines.append(f"  {status.value:15} {count:3} sequences")

    lines.append("")
    lines.append("Processing Results:")
    for result in ProcessingResult:
        count = response.processing_result_counts.get(result.value, 0)
        if count > 0:
            status_desc = {
                ProcessingResult.NO_ISSUES: "(ready for release)",
                ProcessingResult.HAS_WARNINGS: "(ready for release)",
                ProcessingResult.HAS_ERRORS: "(requires attention)",
            }.get(result, "")
            lines.append(f"  {result.value:15} {count:3} sequences {status_desc}")

    lines.append("")
    lines.append(
        f"Summary: {response.ready_count} ready for release, "
        f"{response.error_count} need fixes"
    )

    return "\n".join(lines)


def filter_sequences(
    sequences: list[SequenceEntry],
    status_filter: SequenceStatus | None = None,
    result_filter: ProcessingResult | None = None,
    errors_only: bool = False,
    warnings_only: bool = False,
    ready_only: bool = False,
    pending_only: bool = False,
) -> list[SequenceEntry]:
    """Filter sequences based on various criteria."""
    filtered = sequences

    if status_filter:
        filtered = [s for s in filtered if s.status == status_filter]

    if result_filter:
        filtered = [s for s in filtered if s.processing_result == result_filter]

    if errors_only:
        filtered = [s for s in filtered if s.has_errors]

    if warnings_only:
        filtered = [s for s in filtered if s.has_warnings]

    if ready_only:
        filtered = [s for s in filtered if s.is_ready_for_release]

    if pending_only:
        filtered = [s for s in filtered if s.is_pending]

    return filtered
