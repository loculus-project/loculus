# ruff: noqa: S101


from dataclasses import dataclass, field
from datetime import datetime

import pytz

from loculus_preprocessing.config import Config
from loculus_preprocessing.datatypes import (
    AnnotationSource,
    AnnotationSourceType,
    FileCategory,
    FileIdAndNameAndReadUrl,
    NucleotideSequence,
    ProcessedData,
    ProcessedEntry,
    ProcessedMetadataValue,
    ProcessingAnnotation,
    ProcessingAnnotationAlignment,
    SegmentName,
    SubmissionContext,
    UnprocessedEntry,
)


def ts_from_ymd(year: int, month: int, day: int) -> str:
    """Convert a year, month, and day into a UTC timestamp string."""
    dt = datetime(year, month, day, tzinfo=pytz.UTC)
    return str(dt.timestamp())


def make_submission_context(
    accession_version: str = "accession.1",
    submitted_at: str | None = None,
    submission_id: str = "test_submission_id",
    is_insdc_ingest_group: bool = False,
    insdc_ingest_group_id: int = 1,
) -> SubmissionContext:
    """A SubmissionContext for tests that call ProcessingFunctions directly.

    `group_id` is picked to match the requested `is_insdc_ingest_group`, so tests can't
    construct the contradictory pairing that can never arise in production.
    """
    return SubmissionContext(
        accessionVersion=accession_version,
        submitter="test_submitter",
        group_id=insdc_ingest_group_id if is_insdc_ingest_group else insdc_ingest_group_id + 1,
        submittedAt=submitted_at if submitted_at is not None else ts_from_ymd(2021, 12, 15),
        submissionId=submission_id,
        insdc_ingest_group_id=insdc_ingest_group_id,
    )


@dataclass
class ProcessingTestCase:
    name: str
    input: UnprocessedEntry
    expected_output: ProcessedEntry


@dataclass
class ProcessingAnnotationHelper:
    """Helper class to create ProcessingAnnotation instances easily."""

    unprocessed_field_names: list[str]
    processed_field_names: list[str]
    message: str
    type: AnnotationSourceType = AnnotationSourceType.METADATA

    @classmethod
    def sequence_annotation_helper(cls, message: str) -> "ProcessingAnnotationHelper":
        return cls(
            unprocessed_field_names=[ProcessingAnnotationAlignment],
            processed_field_names=[ProcessingAnnotationAlignment],
            message=message,
            type=AnnotationSourceType.NUCLEOTIDE_SEQUENCE,
        )


@dataclass
class ProcessedAlignment:
    unalignedNucleotideSequences: dict[str, str | None] = field(  # noqa: N815
        default_factory=dict
    )
    alignedNucleotideSequences: dict[str, str | None] = field(  # noqa: N815
        default_factory=dict
    )
    nucleotideInsertions: dict[str, list[str]] = field(default_factory=dict)  # noqa: N815
    alignedAminoAcidSequences: dict[str, str | None] = field(default_factory=dict)  # noqa: N815
    aminoAcidInsertions: dict[str, list[str]] = field(default_factory=dict)  # noqa: N815
    sequenceNameToFastaId: dict[str, str] = field(  # noqa: N815
        default_factory=dict
    )


@dataclass
class UnprocessedEntryFactory:
    @staticmethod
    def create_unprocessed_entry(
        metadata_dict: dict[str, str | None],
        accession_id: str,
        sequences: dict[SegmentName, NucleotideSequence | None],
        is_insdc_ingest_group: bool = False,
        files: dict[FileCategory, list[FileIdAndNameAndReadUrl]] | None = None,
    ) -> UnprocessedEntry:
        return UnprocessedEntry(
            submissionContext=make_submission_context(
                accession_version=f"LOC_{accession_id}.1",
                submission_id=metadata_dict.get("submissionId") or "test_submission_id",
                is_insdc_ingest_group=is_insdc_ingest_group,
            ),
            metadata=metadata_dict,
            unalignedNucleotideSequences=sequences,
            files=files,
        )


def build_processing_annotations(
    items: list[ProcessingAnnotationHelper],
) -> list[ProcessingAnnotation]:
    annotations = []
    for item in items:
        annotation_type: AnnotationSourceType = item.type
        annotations.append(
            ProcessingAnnotation(
                unprocessedFields=[
                    AnnotationSource(name=field, type=annotation_type)
                    for field in item.unprocessed_field_names
                ],
                processedFields=[
                    AnnotationSource(name=field, type=annotation_type)
                    for field in item.processed_field_names
                ],
                message=item.message,
            )
        )
    return annotations


@dataclass
class ProcessedEntryFactory:
    all_metadata_fields: list[str] | None = None

    def __post_init__(self):
        if self.all_metadata_fields is None:
            self.all_metadata_fields = []

    def create_processed_entry(
        self,
        metadata_dict: dict[str, ProcessedMetadataValue],
        accession: str,
        errors: list[ProcessingAnnotation] | None = None,
        warnings: list[ProcessingAnnotation] | None = None,
        processed_alignment: ProcessedAlignment | None = None,
        files: dict[FileCategory, list[FileIdAndNameAndReadUrl]] | None = None,
    ) -> ProcessedEntry:
        if errors is None:
            errors = []
        if warnings is None:
            warnings = []
        if self.all_metadata_fields is None:
            self.all_metadata_fields = []
        base_metadata_dict = dict.fromkeys(self.all_metadata_fields)
        base_metadata_dict.update(metadata_dict)
        if not processed_alignment:
            processed_alignment = ProcessedAlignment()

        return ProcessedEntry(
            accession=accession,
            version=1,
            data=ProcessedData(
                metadata=base_metadata_dict,
                files=files,
                unalignedNucleotideSequences=processed_alignment.unalignedNucleotideSequences,
                alignedNucleotideSequences=processed_alignment.alignedNucleotideSequences,
                nucleotideInsertions=processed_alignment.nucleotideInsertions,
                alignedAminoAcidSequences=processed_alignment.alignedAminoAcidSequences,
                aminoAcidInsertions=processed_alignment.aminoAcidInsertions,
                sequenceNameToFastaId=processed_alignment.sequenceNameToFastaId,
            ),
            errors=errors,
            warnings=warnings,
        )


@dataclass
class Case:
    name: str
    input_metadata: dict[str, str | None] = field(default_factory=dict)
    input_files: dict[FileCategory, list[FileIdAndNameAndReadUrl]] | None = None
    input_sequence: dict[str, str | None] = field(default_factory=lambda: {"main": None})
    accession_id: str = "000999"
    expected_metadata: dict[str, ProcessedMetadataValue] = field(default_factory=dict)
    expected_files: dict[FileCategory, list[FileIdAndNameAndReadUrl]] | None = None
    expected_errors: list[ProcessingAnnotation] | None = None
    expected_warnings: list[ProcessingAnnotation] | None = None
    expected_processed_alignment: ProcessedAlignment | None = None
    is_insdc_ingest_group: bool = False

    def create_test_case(self, factory_custom: ProcessedEntryFactory) -> ProcessingTestCase:
        if not self.expected_processed_alignment:
            self.expected_processed_alignment = ProcessedAlignment()
        unprocessed_entry = UnprocessedEntryFactory.create_unprocessed_entry(
            metadata_dict=self.input_metadata,
            accession_id=self.accession_id,
            sequences=self.input_sequence,
            is_insdc_ingest_group=self.is_insdc_ingest_group,
            files=self.input_files,
        )
        expected_output = factory_custom.create_processed_entry(
            metadata_dict=self.expected_metadata,
            accession=unprocessed_entry.accessionVersion.split(".")[0],
            errors=self.expected_errors or [],
            warnings=self.expected_warnings or [],
            processed_alignment=self.expected_processed_alignment,
            files=self.expected_files,
        )
        return ProcessingTestCase(
            name=self.name, input=unprocessed_entry, expected_output=expected_output
        )


def sort_annotations(annotations: list[ProcessingAnnotation]) -> list[ProcessingAnnotation]:
    return sorted(
        annotations,
        key=lambda x: (
            x.unprocessedFields[0].name if x.unprocessedFields else None,
            x.processedFields[0].name if x.processedFields else None,
            x.message,
        ),
    )


def verify_processed_entry(
    processed_entry: ProcessedEntry, expected_output: ProcessedEntry, test_name: str
):
    # Check accession and version
    assert (
        processed_entry.accession == expected_output.accession
        and processed_entry.version == expected_output.version
    ), (
        f"{test_name}: processed entry accessionVersion "
        f"{processed_entry.accession}.{processed_entry.version} "
        f"does not match expected output {expected_output.accession}.{expected_output.version}."
    )

    # Check errors
    processed_errors = sort_annotations(processed_entry.errors)
    expected_errors = sort_annotations(expected_output.errors)
    assert processed_errors == expected_errors, (
        f"{test_name}: processed errors: {processed_errors}",
        f"does not match expected output: {expected_errors}.",
    )

    # Check warnings
    processed_warnings = sort_annotations(processed_entry.warnings)
    expected_warnings = sort_annotations(expected_output.warnings)
    assert processed_warnings == expected_warnings, (
        f"{test_name}: processed warnings {processed_warnings}"
        f"does not match expected output {expected_warnings}."
    )

    # Check metadata
    assert processed_entry.data.metadata == expected_output.data.metadata, (
        f"{test_name}: processed metadata {processed_entry.data.metadata} "
        f"does not match expected metadata {expected_output.data.metadata}."
    )

    # Check alignment data
    actual = processed_entry.data
    expected = expected_output.data
    assert actual.unalignedNucleotideSequences == expected.unalignedNucleotideSequences, (
        f"{test_name}: unaligned nucleotide sequences '{actual.unalignedNucleotideSequences}' do "
        f"not match expectation '{expected.unalignedNucleotideSequences}'."
    )
    assert actual.alignedNucleotideSequences == expected.alignedNucleotideSequences, (
        f"{test_name}: aligned nucleotide sequences '{actual.alignedNucleotideSequences}' "
        f"do not match expectation '{expected.alignedNucleotideSequences}'."
    )
    assert actual.nucleotideInsertions == expected.nucleotideInsertions, (
        f"{test_name}: nucleotide insertions '{actual.nucleotideInsertions}' do not match "
        f"expectation '{expected.nucleotideInsertions}'."
    )
    assert actual.alignedAminoAcidSequences == expected.alignedAminoAcidSequences, (
        f"{test_name}: aligned amino acid sequences '{actual.alignedAminoAcidSequences}' "
        f"do not match expectation '{expected.alignedAminoAcidSequences}'."
    )
    assert actual.aminoAcidInsertions == expected.aminoAcidInsertions, (
        f"{test_name}: amino acid insertions '{actual.aminoAcidInsertions}' do not "
        f"match expectation '{expected.aminoAcidInsertions}'."
    )
    assert actual.sequenceNameToFastaId == expected.sequenceNameToFastaId, (
        f"{test_name}: sequence name to fasta header map '{actual.sequenceNameToFastaId}' do not "
        f"match expectation '{expected.sequenceNameToFastaId}'."
    )

    # Check files
    assert actual.files == expected.files, (
        f"{test_name}: files '{actual.files}' do not match expectation '{expected.files}'."
    )
