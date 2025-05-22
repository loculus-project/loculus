"""Pydantic models for API requests and responses"""

from typing import Dict, Any, List, Optional, Literal
from pydantic import BaseModel
from enum import Enum


class OrderType(str, Enum):
    ASCENDING = "ascending"
    DESCENDING = "descending"


class OrderBy(BaseModel):
    field: str
    type: OrderType


class LapisBaseRequest(BaseModel):
    """Base request model for LAPIS API calls"""
    limit: Optional[int] = None
    offset: Optional[int] = None
    fields: Optional[List[str]] = None
    orderBy: Optional[List[OrderBy]] = None
    dataFormat: Optional[str] = None
    
    # Dynamic filters - any field can be used for filtering
    class Config:
        extra = "allow"


class MutationsRequest(LapisBaseRequest):
    """Request for mutations endpoints"""
    minProportion: Optional[float] = None


class SequenceRequest(LapisBaseRequest):
    """Request for sequence endpoints"""
    dataFormat: Literal["FASTA", "NDJSON", "JSON", "TSV"] = "FASTA"


class MutationProportionCount(BaseModel):
    """Mutation data response item"""
    mutation: str
    proportion: float
    count: int
    sequenceName: Optional[str] = None
    mutationFrom: str
    mutationTo: str
    position: int


class InsertionCount(BaseModel):
    """Insertion data response item"""
    insertion: str
    count: int


class Info(BaseModel):
    """Response info metadata"""
    dataVersion: str = "1.0.0"


class LapisResponse(BaseModel):
    """Generic LAPIS response wrapper"""
    data: List[Dict[str, Any]]
    info: Info


class MutationsResponse(BaseModel):
    """Response for mutations endpoints"""
    data: List[MutationProportionCount]
    info: Info


class InsertionsResponse(BaseModel):
    """Response for insertions endpoints"""
    data: List[InsertionCount]
    info: Info


class AggregatedItem(BaseModel):
    """Aggregated response item"""
    count: int
    
    class Config:
        extra = "allow"


class AggregatedResponse(BaseModel):
    """Response for aggregated endpoint"""
    data: List[AggregatedItem]
    info: Info


class LineageDefinitionEntry(BaseModel):
    """Lineage definition entry"""
    parents: Optional[List[str]] = None
    aliases: Optional[List[str]] = None


LineageDefinition = Dict[str, LineageDefinitionEntry]