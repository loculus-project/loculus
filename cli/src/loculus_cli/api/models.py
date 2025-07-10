"""Data models for Loculus API."""

from datetime import datetime
from typing import Any, Dict, List, Optional, Union

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
    data: Dict[str, Any]
    submit_time: datetime
    submitter: str
    group_id: int
    processing_status: ProcessingStatus


class ProcessedData(BaseModel):
    """Processed sequence data."""
    
    accession_version: AccessionVersion
    data: Dict[str, Any]
    submit_time: datetime
    submitter: str
    group_id: int
    processing_status: ProcessingStatus


class SubmissionResponse(BaseModel):
    """Response from submission endpoint."""
    
    accession_versions: List[AccessionVersion]
    warnings: List[str] = Field(default_factory=list)
    errors: List[str] = Field(default_factory=list)


class RevisionResponse(BaseModel):
    """Response from revision endpoint."""
    
    accession_versions: List[AccessionVersion]
    warnings: List[str] = Field(default_factory=list)
    errors: List[str] = Field(default_factory=list)




class LapisResponse(BaseModel):
    """Generic LAPIS response."""
    
    data: List[Dict[str, Any]]
    info: Dict[str, Any]


class LapisSequenceResponse(BaseModel):
    """LAPIS sequence response."""
    
    data: List[Dict[str, str]]  # Usually contains sequence data
    info: Dict[str, Any]


class LapisAggregatedResponse(BaseModel):
    """LAPIS aggregated response."""
    
    data: List[Dict[str, Union[str, int]]]
    info: Dict[str, Any]


class GroupInfo(BaseModel):
    """Information about a submission group."""
    
    groupId: int
    groupName: str
    institution: str
    address: Dict[str, str]
    contactEmail: str


class OrganismInfo(BaseModel):
    """Information about an organism."""
    
    name: str
    display_name: str
    metadata: Dict[str, Any]
    reference_genomes: List[Dict[str, Any]]


class InstanceInfo(BaseModel):
    """Information about a Loculus instance."""
    
    organisms: List[OrganismInfo]
    citation: str
    title: str
    description: str