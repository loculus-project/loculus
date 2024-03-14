from dataclasses import dataclass, field
from enum import StrEnum, unique
from typing import Any

AccessionVersion = str
GeneName = str
NucleotideSequence = str
AminoAcidSequence = str
NucleotideInsertion = str
AminoAcidInsertion = str
FunctionName = str  # Name of function present in processing_functions
ArgName = str  # Name of argument present in processing_functions
InputField = (
    str  # Name of field in input data, either inputMetadata or NextcladeMetadata
)
ProcessingInput = dict[str, str | None]


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
    metadata: dict[str, str]
    unalignedNucleotideSequences: dict[str, NucleotideSequence]


@dataclass
class UnprocessedEntry:
    accessionVersion: AccessionVersion  # {accession}.{version}
    data: UnprocessedData


FunctionInputs = dict[ArgName, InputField]


@dataclass
class ProcessingSpec:
    inputs: FunctionInputs
    function: FunctionName
    required: bool | None


# For single segment, need to generalize for multi segments later
@dataclass
class UnprocessedAfterNextclade:
    inputMetadata: dict[str, Any]  # Original user supplied metadata
    nextcladeMetadata: dict[str, Any] | None  # Derived metadata produced by Nextclade
    unalignedNucleotideSequences: NucleotideSequence
    alignedNucleotideSequences: NucleotideSequence | None
    nucleotideInsertions: list[NucleotideInsertion]
    alignedAminoAcidSequences: dict[GeneName, AminoAcidSequence | None]
    aminoAcidInsertions: dict[GeneName, list[AminoAcidInsertion]]


@dataclass
class ProcessedData:
    metadata: dict[str, Any]
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
    datum: str | None
    warnings: list[ProcessingAnnotation] = field(default_factory=list)
    errors: list[ProcessingAnnotation] = field(default_factory=list)
