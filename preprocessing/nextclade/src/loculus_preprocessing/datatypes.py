from dataclasses import dataclass, field
from enum import StrEnum, unique
from typing import Any, Final

AccessionVersion = str
GeneName = str
SegmentName = str
NucleotideSequence = str
AminoAcidSequence = str
GenericSequence = AminoAcidSequence | NucleotideSequence
NucleotideInsertion = str
AminoAcidInsertion = str
FunctionName = str  # Name of function present in processing_functions
ArgName = str  # Name of argument present in processing_functions
ArgValue = list[str] | str | bool | None  # Name of argument value present in processing_functions
InputField = str  # Name of field in input data, either inputMetadata or NextcladeMetadata
ProcessedMetadataValue = str | int | float | bool | None
ProcessedMetadata = dict[str, ProcessedMetadataValue]
InputMetadataValue = str | None
InputMetadata = dict[str, InputMetadataValue]

ProcessingAnnotationAlignment: Final = "alignment"


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
    unprocessedFields: list[AnnotationSource]  # noqa: N815
    processedFields: list[AnnotationSource]  # noqa: N815
    message: str

    def __post_init__(self):
        object.__setattr__(self, "unprocessedFields", tuple(self.unprocessedFields))
        object.__setattr__(self, "processedFields", tuple(self.processedFields))

    def __hash__(self):
        return hash((self.unprocessedFields, self.processedFields, self.message))

    @classmethod
    def from_fields(cls, input_fields, output_fields, type, message):
        return cls(
            unprocessedFields=[AnnotationSource(name=f, type=type) for f in input_fields],
            processedFields=[AnnotationSource(name=f, type=type) for f in output_fields],
            message=message,
        )

    @classmethod
    def from_single(cls, name: str, type, message: str):
        return cls.from_fields([name], [name], type, message)


@dataclass
class UnprocessedData:
    submitter: str
    group_id: int
    submittedAt: str  # timestamp  # noqa: N815
    metadata: InputMetadata
    unalignedNucleotideSequences: dict[SegmentName, NucleotideSequence | None]  # noqa: N815


@dataclass
class UnprocessedEntry:
    accessionVersion: AccessionVersion  # {accession}.{version}  # noqa: N815
    data: UnprocessedData


FunctionInputs = dict[ArgName, InputField]
FunctionArgs = dict[ArgName, ArgValue]


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
    warnings: list[ProcessingAnnotation]


@dataclass
class FileIdAndName:
    fileId: str  # noqa: N815
    name: str


@dataclass
class ProcessedData:
    metadata: ProcessedMetadata
    unalignedNucleotideSequences: dict[SegmentName, Any]  # noqa: N815
    alignedNucleotideSequences: dict[SegmentName, Any]  # noqa: N815
    nucleotideInsertions: dict[SegmentName, Any]  # noqa: N815
    alignedAminoAcidSequences: dict[GeneName, Any]  # noqa: N815
    aminoAcidInsertions: dict[GeneName, Any]  # noqa: N815
    files: dict[str, list[FileIdAndName]] | None = None


@dataclass
class Annotation:
    message: str


@dataclass
class Alerts:
    errors: dict[AccessionVersion, list[ProcessingAnnotation]] = field(default_factory=dict)
    warnings: dict[AccessionVersion, list[ProcessingAnnotation]] = field(default_factory=dict)


@dataclass
class ProcessedEntry:
    accession: str
    version: int
    data: ProcessedData
    errors: list[ProcessingAnnotation] = field(default_factory=list)
    warnings: list[ProcessingAnnotation] = field(default_factory=list)


@dataclass
class SubmissionData:
    """Wraps a processed entry together with group ID and annotation information.
    The processed entry is submitted as usual,
    but the annotations need to be uploaded separately."""

    processed_entry: ProcessedEntry
    submitter: str | None
    group_id: int | None = None
    annotations: dict[str, Any] | None = None


@dataclass
class InputData:
    datum: InputMetadataValue
    warnings: list[ProcessingAnnotation] = field(default_factory=list)
    errors: list[ProcessingAnnotation] = field(default_factory=list)


@dataclass
class ProcessingResult:
    datum: ProcessedMetadataValue
    warnings: list[ProcessingAnnotation] = field(default_factory=list)
    errors: list[ProcessingAnnotation] = field(default_factory=list)


@dataclass
class FileUploadInfo:
    """Objects of this type are returned by the /files/request-upload endpoint."""

    fileId: str  # noqa: N815
    url: str


class MoleculeType(StrEnum):
    GENOMIC_DNA = "genomic DNA"
    GENOMIC_RNA = "genomic RNA"
    VIRAL_CRNA = "viral cRNA"


class Topology(StrEnum):
    LINEAR = "linear"
    CIRCULAR = "circular"
