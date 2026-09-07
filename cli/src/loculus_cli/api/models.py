"""Data models for Loculus API."""

from dataclasses import dataclass
from datetime import datetime
from enum import Enum
from typing import Any

from pydantic import BaseModel, Field


class AccessionVersion(BaseModel):
    """Accession version identifier."""

    accession: str
    version: int


class ProcessingStatus(BaseModel):
    """Processing status of a sequence."""

    status: str
    status_count: int
    total_count: int


class UnprocessedData(BaseModel):
    """Unprocessed sequence data."""

    accession_version: AccessionVersion
    data: dict[str, Any]
    submit_time: datetime
    submitter: str
    group_id: int
    processing_status: ProcessingStatus


class SubmissionResponse(BaseModel):
    """Response from submission endpoint."""

    accession_versions: list[AccessionVersion]
    warnings: list[str] = Field(default_factory=list)
    errors: list[str] = Field(default_factory=list)


class LapisResponse(BaseModel):
    """Generic LAPIS response."""

    data: list[dict[str, Any]]
    info: dict[str, Any]


class LapisSequenceResponse(BaseModel):
    """LAPIS sequence response."""

    data: list[dict[str, str]]  # Usually contains sequence data
    info: dict[str, Any]


class LapisAggregatedResponse(BaseModel):
    """LAPIS aggregated response."""

    data: list[dict[str, str | int]]
    info: dict[str, Any]


class GroupInfo(BaseModel):
    """Information about a submission group."""

    groupId: int
    groupName: str
    institution: str
    address: dict[str, str]
    contactEmail: str


class OrganismInfo(BaseModel):
    """Information about an organism."""

    name: str
    display_name: str
    metadata: dict[str, Any]
    reference_genomes: list[dict[str, Any]]


class InstanceInfo(BaseModel):
    """Information about a Loculus instance."""

    organisms: list[OrganismInfo]
    citation: str
    title: str
    description: str


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
