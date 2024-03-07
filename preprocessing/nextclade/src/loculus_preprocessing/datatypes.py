from dataclasses import dataclass, field
from typing import Any, Literal

AccessionVersion = str
# NextcladeResult = dict[str, dict[str, Any]]
GeneName = str
NucleotideSequence = str
AminoAcidSequence = str
NucleotideInsertion = str
AminoAcidInsertion = str
FunctionName = str  # Name of function present in processing_functions


@dataclass
class UnprocessedData:
    metadata: dict[str, str]
    unalignedNucleotideSequences: dict[str, NucleotideSequence]


@dataclass
class UnprocessedEntry:
    accessionVersion: AccessionVersion  # {accession}.{version}
    data: UnprocessedData


@dataclass
class ProcessingSpec:
    inputs: list[str]
    function: FunctionName


# For single segment, need to generalize for multi segments later
@dataclass
class UnprocessedWithNextclade:
    inputMetadata: dict[str, Any]  # Original user supplied metadata
    nextcladeMetadata: dict[str, Any]  # Derived metadata produced by Nextclade
    unalignedNucleotideSequences: NucleotideSequence
    alignedNucleotideSequences: NucleotideSequence
    nucleotideInsertions: list[NucleotideInsertion]
    alignedAminoAcidSequences: dict[GeneName, AminoAcidSequence]
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


@dataclass
class ProcessingResult:
    datum: str | None
    warnings: list[ProcessingAnnotation] = field(default_factory=list)
    errors: list[ProcessingAnnotation] = field(default_factory=list)
