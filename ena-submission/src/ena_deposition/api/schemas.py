"""Pydantic schemas for the ENA Deposition API."""

from datetime import datetime
from enum import StrEnum
from typing import Any

from pydantic import BaseModel, ConfigDict


class SubmissionStatusAll(StrEnum):
    """All possible submission statuses."""

    READY_TO_SUBMIT = "READY_TO_SUBMIT"
    SUBMITTING_PROJECT = "SUBMITTING_PROJECT"
    SUBMITTED_PROJECT = "SUBMITTED_PROJECT"
    SUBMITTING_SAMPLE = "SUBMITTING_SAMPLE"
    SUBMITTED_SAMPLE = "SUBMITTED_SAMPLE"
    SUBMITTING_ASSEMBLY = "SUBMITTING_ASSEMBLY"
    SUBMITTED_ALL = "SUBMITTED_ALL"
    SENT_TO_LOCULUS = "SENT_TO_LOCULUS"
    HAS_ERRORS_PROJECT = "HAS_ERRORS_PROJECT"
    HAS_ERRORS_ASSEMBLY = "HAS_ERRORS_ASSEMBLY"
    HAS_ERRORS_SAMPLE = "HAS_ERRORS_SAMPLE"
    HAS_ERRORS_EXT_METADATA_UPLOAD = "HAS_ERRORS_EXT_METADATA_UPLOAD"


class TableStatus(StrEnum):
    """Status for individual tables (project, sample, assembly)."""

    READY = "READY"
    SUBMITTING = "SUBMITTING"
    SUBMITTED = "SUBMITTED"
    HAS_ERRORS = "HAS_ERRORS"
    WAITING = "WAITING"


class SubmissionSummary(BaseModel):
    """Summary of a submission for list views."""

    model_config = ConfigDict(from_attributes=True)

    accession: str
    version: int
    organism: str
    group_id: int
    status_all: SubmissionStatusAll
    started_at: datetime
    finished_at: datetime | None = None
    has_errors: bool = False
    error_count: int = 0


class SubmissionDetail(BaseModel):
    """Full details of a submission."""

    model_config = ConfigDict(from_attributes=True)

    accession: str
    version: int
    organism: str
    group_id: int
    status_all: SubmissionStatusAll
    metadata: dict[str, Any]
    unaligned_nucleotide_sequences: dict[str, str | None]
    errors: list[str] | None = None
    warnings: list[str] | None = None
    started_at: datetime
    finished_at: datetime | None = None
    external_metadata: dict[str, Any] | None = None
    project_status: TableStatus | None = None
    sample_status: TableStatus | None = None
    assembly_status: TableStatus | None = None
    project_result: dict[str, Any] | None = None
    sample_result: dict[str, Any] | None = None
    assembly_result: dict[str, Any] | None = None


class PaginatedSubmissions(BaseModel):
    """Paginated list of submissions."""

    items: list[SubmissionSummary]
    total: int
    page: int
    size: int
    pages: int


class PreviewRequest(BaseModel):
    """Request to generate a preview of submissions."""

    accessions: list[str]  # List of "accession.version" strings


class SubmissionPreviewItem(BaseModel):
    """Preview of a single submission."""

    accession: str
    version: int
    organism: str
    group_id: int
    metadata: dict[str, Any]
    unaligned_nucleotide_sequences: dict[str, str | None]
    validation_errors: list[str] = []
    validation_warnings: list[str] = []


class PreviewResponse(BaseModel):
    """Response containing previews of submissions."""

    previews: list[SubmissionPreviewItem]


class SubmitItem(BaseModel):
    """A single item to submit to ENA."""

    accession: str
    version: int
    organism: str
    group_id: int
    metadata: dict[str, Any]
    unaligned_nucleotide_sequences: dict[str, str | None]


class SubmitRequest(BaseModel):
    """Request to submit sequences to ENA."""

    submissions: list[SubmitItem]


class SubmitError(BaseModel):
    """Error for a single submission."""

    accession: str
    version: int
    message: str


class SubmitResponse(BaseModel):
    """Response after submitting sequences."""

    submitted: list[str]  # "accession.version" strings
    errors: list[SubmitError]


class ErrorItem(BaseModel):
    """A submission with errors."""

    model_config = ConfigDict(from_attributes=True)

    accession: str
    version: int
    organism: str
    group_id: int
    table: str  # project/sample/assembly/submission
    error_messages: list[str]
    status: str
    started_at: datetime
    can_retry: bool = True


class PaginatedErrors(BaseModel):
    """Paginated list of errors."""

    items: list[ErrorItem]
    total: int
    page: int
    size: int
    pages: int


class RetryRequest(BaseModel):
    """Request to retry a failed submission."""

    edited_metadata: dict[str, Any] | None = None


class ActionResponse(BaseModel):
    """Response for retry/cancel actions."""

    success: bool
    message: str


class HealthResponse(BaseModel):
    """Health check response."""

    status: str
    message: str
