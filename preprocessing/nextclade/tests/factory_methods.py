# ruff: noqa: S101


from dataclasses import dataclass, field
from datetime import datetime

import pytz

from loculus_preprocessing.datatypes import (
    AnnotationSource,
    AnnotationSourceType,
    NucleotideSequence,
    ProcessedData,
    ProcessedEntry,
    ProcessedMetadataValue,
    ProcessingAnnotation,
    SegmentName,
    UnprocessedData,
    UnprocessedEntry,
)


def ts_from_ymd(year: int, month: int, day: int) -> str:
    """Convert a year, month, and day into a UTC timestamp string."""
    dt = datetime(year, month, day, tzinfo=pytz.UTC)
    return str(dt.timestamp())


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


@dataclass
class UnprocessedEntryFactory:
    @staticmethod
    def create_unprocessed_entry(
        metadata_dict: dict[str, str | None],
        accession_id: str,
        sequences: dict[SegmentName, NucleotideSequence | None],
    ) -> UnprocessedEntry:
        return UnprocessedEntry(
            accessionVersion=f"LOC_{accession_id}.1",
            data=UnprocessedData(
                submitter="test_submitter",
                submittedAt=str(
                    datetime.strptime("2021-12-15", "%Y-%m-%d").replace(tzinfo=pytz.utc).timestamp()
                ),
                group_id=2,
                metadata=metadata_dict,
                unalignedNucleotideSequences=sequences,
            ),
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
        metadata_errors: list[ProcessingAnnotationHelper] | None = None,
        metadata_warnings: list[ProcessingAnnotationHelper] | None = None,
        processed_alignment: ProcessedAlignment | None = None,
    ) -> ProcessedEntry:
        if metadata_errors is None:
            metadata_errors = []
        if metadata_warnings is None:
            metadata_warnings = []
        if self.all_metadata_fields is None:
            self.all_metadata_fields = []
        base_metadata_dict = dict.fromkeys(self.all_metadata_fields)
        base_metadata_dict.update(metadata_dict)
        if not processed_alignment:
            processed_alignment = ProcessedAlignment()

        errors = build_processing_annotations(metadata_errors)
        warnings = build_processing_annotations(metadata_warnings)

        return ProcessedEntry(
            accession=accession,
            version=1,
            data=ProcessedData(
                metadata=base_metadata_dict,
                unalignedNucleotideSequences=processed_alignment.unalignedNucleotideSequences,
                alignedNucleotideSequences=processed_alignment.alignedNucleotideSequences,
                nucleotideInsertions=processed_alignment.nucleotideInsertions,
                alignedAminoAcidSequences=processed_alignment.alignedAminoAcidSequences,
                aminoAcidInsertions=processed_alignment.aminoAcidInsertions,
            ),
            errors=errors,
            warnings=warnings,
        )


@dataclass
class Case:
    name: str
    input_metadata: dict[str, str | None] = field(default_factory=dict)
    input_sequence: dict[str, str | None] = field(default_factory=lambda: {"main": None})
    accession_id: str = "000999"
    expected_metadata: dict[str, ProcessedMetadataValue] = field(default_factory=dict)
    expected_errors: list[ProcessingAnnotationHelper] | None = None
    expected_warnings: list[ProcessingAnnotationHelper] | None = None
    expected_processed_alignment: ProcessedAlignment | None = None

    def create_test_case(self, factory_custom: ProcessedEntryFactory) -> ProcessingTestCase:
        if not self.expected_processed_alignment:
            self.expected_processed_alignment = ProcessedAlignment()
        unprocessed_entry = UnprocessedEntryFactory.create_unprocessed_entry(
            metadata_dict=self.input_metadata,
            accession_id=self.accession_id,
            sequences=self.input_sequence,
        )
        expected_output = factory_custom.create_processed_entry(
            metadata_dict=self.expected_metadata,
            accession=unprocessed_entry.accessionVersion.split(".")[0],
            metadata_errors=self.expected_errors or [],
            metadata_warnings=self.expected_warnings or [],
            processed_alignment=self.expected_processed_alignment,
        )
        return ProcessingTestCase(
            name=self.name, input=unprocessed_entry, expected_output=expected_output
        )


def sort_annotations(annotations: list[ProcessingAnnotation]) -> list[ProcessingAnnotation]:
    return sorted(
        annotations,
        key=lambda x: (x.unprocessedFields[0].name, x.processedFields[0].name, x.message),
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

    # Check metadata
    # assert processed_entry.data.metadata == expected_output.data.metadata, (
    #     f"{test_name}: processed metadata {processed_entry.data.metadata} "
    #     f"does not match expected metadata {expected_output.data.metadata}."
    # )

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
