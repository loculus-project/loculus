# ruff: noqa: N815
from dataclasses import dataclass, field
from enum import StrEnum, unique
from typing import Any

AccessionVersion = str
GeneName = str
SegmentName = str
NucleotideSequence = str
AminoAcidSequence = str
NucleotideInsertion = str
AminoAcidInsertion = str
FunctionName = str  # Name of function present in processing_functions
ArgName = str  # Name of argument present in processing_functions
ArgValue = str  # Name of argument present in processing_functions
InputField = str  # Name of field in input data, either inputMetadata or NextcladeMetadata
ProcessedMetadataValue = str | int | float | None
ProcessedMetadata = dict[str, ProcessedMetadataValue]
InputMetadataValue = str | None
InputMetadata = dict[str, InputMetadataValue]


@unique
class AnnotationSourceType(StrEnum):
    METADATA = "Metadata"
    NUCLEOTIDE_SEQUENCE = "NucleotideSequence"


@dataclass
class AnnotationSource:
    name: str
    type: AnnotationSourceType


@dataclass
class ProcessingAnnotation:
    source: list[AnnotationSource]
    message: str


@dataclass
class UnprocessedData:
    metadata: InputMetadata
    unalignedNucleotideSequences: dict[str, NucleotideSequence]


@dataclass
class UnprocessedEntry:
    accessionVersion: AccessionVersion  # {accession}.{version}
    data: UnprocessedData


FunctionInputs = dict[ArgName, InputField]
FunctionArgs = dict[ArgName, ArgValue] | None


@dataclass
class ProcessingSpec:
    inputs: FunctionInputs
    function: FunctionName
    required: bool | None
    args: FunctionArgs


# For single segment, need to generalize for multi segments later
@dataclass
class UnprocessedAfterNextclade:
    inputMetadata: InputMetadata
    # Derived metadata produced by Nextclade
    nextcladeMetadata: dict[str, Any] | None
    unalignedNucleotideSequences: dict[str, NucleotideSequence | None]
    alignedNucleotideSequences: dict[str, NucleotideSequence | None]
    nucleotideInsertions: dict[str, list[NucleotideInsertion]]
    alignedAminoAcidSequences: dict[GeneName, AminoAcidSequence | None]
    aminoAcidInsertions: dict[GeneName, list[AminoAcidInsertion]]


@dataclass
class ProcessedData:
    metadata: ProcessedMetadata
    unalignedNucleotideSequences: dict[str, Any]
    alignedNucleotideSequences: dict[str, Any]
    nucleotideInsertions: dict[str, Any]
    alignedAminoAcidSequences: dict[str, Any]
    aminoAcidInsertions: dict[str, Any]


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


@dataclass
class ProcessingResult:
    datum: ProcessedMetadataValue
    warnings: list[ProcessingAnnotation] = field(default_factory=list)
    errors: list[ProcessingAnnotation] = field(default_factory=list)
