# ruff: noqa: N815
from dataclasses import dataclass, field
from enum import StrEnum, unique
from typing import List, Tuple, Any

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
ProcessedMetadataValue = str | int | float | bool | None
ProcessedMetadata = dict[str, ProcessedMetadataValue]
InputMetadataValue = str | None
InputMetadata = dict[str, InputMetadataValue]


@unique
class AnnotationSourceType(StrEnum):
    METADATA = "Metadata"
    NUCLEOTIDE_SEQUENCE = "NucleotideSequence"


@dataclass(frozen=True)
class AnnotationSource:
    name: str
    type: AnnotationSourceType

    def __hash__(self):
        return hash((self.name, self.type))


@dataclass(frozen=True)
class ProcessingAnnotation:
    source: Tuple[AnnotationSource, ...]
    message: str

    def __post_init__(self):
        object.__setattr__(self, "source", tuple(self.source))

    def __hash__(self):
        return hash((self.source, self.message))


@dataclass
class UnprocessedData:
    submitter: str
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
    nextcladeMetadata: dict[SegmentName, Any] | None
    unalignedNucleotideSequences: dict[SegmentName, NucleotideSequence | None]
    alignedNucleotideSequences: dict[SegmentName, NucleotideSequence | None]
    nucleotideInsertions: dict[SegmentName, list[NucleotideInsertion]]
    alignedAminoAcidSequences: dict[GeneName, AminoAcidSequence | None]
    aminoAcidInsertions: dict[GeneName, list[AminoAcidInsertion]]
    errors: list[ProcessingAnnotation]


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
