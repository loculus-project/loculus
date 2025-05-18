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
    unprocessedFields: tuple[AnnotationSource, ...]  # noqa: N815
    processedFields: tuple[AnnotationSource, ...]  # noqa: N815
    message: str

    def __post_init__(self):
        object.__setattr__(self, "unprocessedFields", tuple(self.unprocessedFields))
        object.__setattr__(self, "processedFields", tuple(self.processedFields))

    def __hash__(self):
        return hash((self.unprocessedFields, self.processedFields, self.message))


@dataclass
class UnprocessedData:
    submitter: str
    metadata: InputMetadata
    unalignedNucleotideSequences: dict[str, NucleotideSequence]  # noqa: N815


@dataclass
class UnprocessedEntry:
    accessionVersion: AccessionVersion  # {accession}.{version}  # noqa: N815
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
    inputMetadata: InputMetadata  # noqa: N815
    # Derived metadata produced by Nextclade
    nextcladeMetadata: dict[SegmentName, Any] | None  # noqa: N815
    unalignedNucleotideSequences: dict[SegmentName, NucleotideSequence | None]  # noqa: N815
    alignedNucleotideSequences: dict[SegmentName, NucleotideSequence | None]  # noqa: N815
    nucleotideInsertions: dict[SegmentName, list[NucleotideInsertion]]  # noqa: N815
    alignedAminoAcidSequences: dict[GeneName, AminoAcidSequence | None]  # noqa: N815
    aminoAcidInsertions: dict[GeneName, list[AminoAcidInsertion]]  # noqa: N815
    errors: list[ProcessingAnnotation]


@dataclass
class ProcessedData:
    metadata: ProcessedMetadata
    unalignedNucleotideSequences: dict[str, Any]  # noqa: N815
    alignedNucleotideSequences: dict[str, Any]  # noqa: N815
    nucleotideInsertions: dict[str, Any]  # noqa: N815
    alignedAminoAcidSequences: dict[str, Any]  # noqa: N815
    aminoAcidInsertions: dict[str, Any]  # noqa: N815


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
