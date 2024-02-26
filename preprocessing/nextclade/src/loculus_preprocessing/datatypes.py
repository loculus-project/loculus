from collections.abc import Mapping
from dataclasses import dataclass, field
from typing import Any, Literal

AccessionVersion = str
NextcladeResult = dict[str, dict[str, Any]]


@dataclass
class UnprocessedData:
    metadata: Mapping[str, str]
    unalignedNucleotideSequences: Mapping[str, str]


@dataclass
class UnprocessedEntry:
    accessionVersion: AccessionVersion  # {accession}.{version}
    data: UnprocessedData


@dataclass
class ProcessedData:
    metadata: dict[str, dict[str, Any]]
    unalignedNucleotideSequences: dict[str, Any]
    alignedNucleotideSequences: dict[str, Any]
    nucleotideInsertions: dict[str, Any]
    alignedAminoAcidSequences: dict[str, Any]
    aminoAcidInsertions: dict[str, Any]


@dataclass
class AnnotationSource:
    field: str
    type: Literal["metadata", "nucleotideSequence"]


@dataclass
class ProcessingAnnotation:
    source: AnnotationSource
    message: str


@dataclass
class Annotation:
    message: str


@dataclass
class ProcessedEntry:
    accession: str
    version: int
    data: ProcessedData
    errors: list[ProcessingAnnotation] = field(default_factory=list)
    warnings: list[ProcessingAnnotation] = field(default_factory=list)
