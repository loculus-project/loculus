"""Shared utilities for review-related CLI commands (status and release)."""

from dataclasses import dataclass
from enum import Enum
from typing import Any

import httpx
from rich.table import Table
from rich.text import Text

from ..auth.client import AuthClient
from ..config import InstanceConfig


class SequenceStatus(str, Enum):
    """Sequence processing status values."""

    RECEIVED = "RECEIVED"
    IN_PROCESSING = "IN_PROCESSING"
    PROCESSED = "PROCESSED"
    APPROVED_FOR_RELEASE = "APPROVED_FOR_RELEASE"


class ProcessingResult(str, Enum):
    """Sequence processing result values."""

    NO_ISSUES = "NO_ISSUES"
    HAS_WARNINGS = "HAS_WARNINGS"
    HAS_ERRORS = "HAS_ERRORS"


@dataclass
class SequenceEntry:
    """Represents a sequence entry with status information."""

    accession: str
    version: int
    status: SequenceStatus
    processing_result: ProcessingResult | None
    submission_id: str
    submitter: str
    group_id: int
    data_use_terms: dict[str, Any]
    is_revocation: bool

    @classmethod
    def from_api_response(cls, data: dict[str, Any]) -> "SequenceEntry":
        """Create SequenceEntry from API response data."""
        return cls(
            accession=data["accession"],
            version=data["version"],
            status=SequenceStatus(data["status"]),
            processing_result=(
                ProcessingResult(data["processingResult"])
                if data.get("processingResult")
                else None
            ),
            submission_id=data["submissionId"],
            submitter=data["submitter"],
            group_id=data["groupId"],
            data_use_terms=data["dataUseTerms"],
            is_revocation=data["isRevocation"],
        )

    @property
    def accession_version(self) -> str:
        """Return formatted accession.version string."""
        return f"{self.accession}.{self.version}"

    @property
    def is_ready_for_release(self) -> bool:
        """Check if sequence is ready for release (processed with no errors)."""
        return self.status == SequenceStatus.PROCESSED and self.processing_result in [
            ProcessingResult.NO_ISSUES,
            ProcessingResult.HAS_WARNINGS,
        ]

    @property
    def has_errors(self) -> bool:
        """Check if sequence has processing errors."""
        return self.processing_result == ProcessingResult.HAS_ERRORS

    @property
    def has_warnings(self) -> bool:
        """Check if sequence has processing warnings."""
        return self.processing_result == ProcessingResult.HAS_WARNINGS

    @property
    def is_pending(self) -> bool:
        """Check if sequence is still being processed."""
        return self.status in [SequenceStatus.RECEIVED, SequenceStatus.IN_PROCESSING]


@dataclass
class SequencesResponse:
    """Response from get-sequences API endpoint."""

    sequence_entries: list[SequenceEntry]
    status_counts: dict[str, int]
    processing_result_counts: dict[str, int]

    @classmethod
    def from_api_response(cls, data: dict[str, Any]) -> "SequencesResponse":
        """Create SequencesResponse from API response data."""
        return cls(
            sequence_entries=[
                SequenceEntry.from_api_response(entry)
                for entry in data["sequenceEntries"]
            ],
            status_counts=data["statusCounts"],
            processing_result_counts=data["processingResultCounts"],
        )

    @property
    def total_count(self) -> int:
        """Get total number of sequences."""
        return sum(self.status_counts.values())

    @property
    def ready_count(self) -> int:
        """Get number of sequences ready for release."""
        return self.processing_result_counts.get(
            ProcessingResult.NO_ISSUES.value, 0
        ) + self.processing_result_counts.get(ProcessingResult.HAS_WARNINGS.value, 0)

    @property
    def error_count(self) -> int:
        """Get number of sequences with errors."""
        return self.processing_result_counts.get(ProcessingResult.HAS_ERRORS.value, 0)


class ReviewApiClient:
    """API client for review-related operations."""

    def __init__(self, instance_config: InstanceConfig, auth_client: AuthClient):
        self.instance_config = instance_config
        self.auth_client = auth_client

    def _get_auth_headers(self) -> dict[str, str]:
        """Get authorization headers."""
        current_user = self.auth_client.get_current_user()
        if not current_user:
            raise RuntimeError(
                "Not authenticated. Please run 'loculus auth login' first."
            )
        return self.auth_client.get_auth_headers(current_user)

    def get_sequences(
        self,
        organism: str,
        group_ids: list[int] | None = None,
        statuses: list[SequenceStatus] | None = None,
        results: list[ProcessingResult] | None = None,
        page: int = 0,
        size: int = 50,
    ) -> SequencesResponse:
        """Fetch sequences with filtering and pagination."""
        backend_url = self.instance_config.backend_url

        params = {
            "page": page,
            "size": size,
        }

        if group_ids:
            params["groupIdsFilter"] = ",".join(map(str, group_ids))  # type: ignore[assignment]

        if statuses:
            params["statusesFilter"] = ",".join(status.value for status in statuses)  # type: ignore[assignment]

        if results:
            params["processingResultFilter"] = ",".join(
                result.value for result in results
            )  # type: ignore[assignment]

        response = httpx.get(
            f"{backend_url}/{organism}/get-sequences",
            headers=self._get_auth_headers(),
            params=params,
        )
        response.raise_for_status()

        return SequencesResponse.from_api_response(response.json())

    def get_sequence_details(
        self, organism: str, accession: str, version: int
    ) -> dict[str, Any]:
        """Fetch detailed sequence information."""
        backend_url = self.instance_config.backend_url

        response = httpx.get(
            f"{backend_url}/{organism}/get-data-to-edit/{accession}/{version}",
            headers=self._get_auth_headers(),
        )
        response.raise_for_status()

        return response.json()

    def approve_sequences(
        self,
        organism: str,
        group_ids: list[int],
        accession_versions: list[dict[str, Any]] | None = None,
        scope: str = "ALL",
    ) -> list[dict[str, Any]]:
        """Approve sequences for release."""
        backend_url = self.instance_config.backend_url

        data = {
            "groupIdsFilter": group_ids,
            "scope": scope,
        }

        if accession_versions:
            data["accessionVersionsFilter"] = accession_versions

        response = httpx.post(
            f"{backend_url}/{organism}/approve-processed-data",
            headers=self._get_auth_headers(),
            json=data,
        )
        response.raise_for_status()

        return response.json()


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
