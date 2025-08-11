"""Data models for Loculus API."""

from datetime import datetime
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
