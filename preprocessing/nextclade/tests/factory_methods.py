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
class ProcessingAnnotationTestCase:
    unprocessedFieldsName: list[str]  # noqa: N815
    processedFieldsName: list[str]  # noqa: N815
    message: str
    type: AnnotationSourceType = AnnotationSourceType.METADATA


@dataclass
class ProcessedAlignment:
    unalignedNucleotideSequences: dict[str, str | None] = field(  # noqa: N815
        default_factory=lambda: {"main": None}
    )
    alignedNucleotideSequences: dict[str, str | None] = field(  # noqa: N815
        default_factory=lambda: {"main": None}
    )
    nucleotideInsertions: dict[str, list[str]] = field(default_factory=lambda: {"main": []})  # noqa: N815
    alignedAminoAcidSequences: dict[str, str | None] = field(default_factory=dict)  # noqa: N815
    aminoAcidInsertions: dict[str, list[str]] = field(default_factory=dict)  # noqa: N815


@dataclass
class UnprocessedEntryFactory:
    @staticmethod
    def create_unprocessed_entry(
        metadata_dict: dict[str, str | None],
        accession_id: str,
        sequences: dict[SegmentName, NucleotideSequence | None] = {"main": ""},
    ) -> UnprocessedEntry:
        return UnprocessedEntry(
            accessionVersion=f"LOC_{accession_id}.1",
            data=UnprocessedData(
                submitter="test_submitter",
                submittedAt=str(
                    datetime.strptime("2021-12-15", "%Y-%m-%d").replace(tzinfo=pytz.utc).timestamp()
                ),
                metadata=metadata_dict,
                unalignedNucleotideSequences=sequences,
            ),
        )


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
        metadata_errors: list[ProcessingAnnotationTestCase] | None = None,
        metadata_warnings: list[ProcessingAnnotationTestCase] | None = None,
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

        errors = [
                ProcessingAnnotation(
                    unprocessedFields=[
                        AnnotationSource(
                            name=field,
                            type=AnnotationSourceType.METADATA,
                        )
                        for field in error.unprocessedFieldsName
                    ],
                    processedFields=[
                        AnnotationSource(name=field, type=AnnotationSourceType.METADATA)
                        for field in error.processedFieldsName
                    ],
                    message=error.message,
                )
                for error in metadata_errors if error.type == AnnotationSourceType.METADATA
            ]
        errors.extend(
            [
                ProcessingAnnotation(
                    unprocessedFields=[
                        AnnotationSource(
                            name=field,
                            type=AnnotationSourceType.NUCLEOTIDE_SEQUENCE,
                        )
                        for field in error.unprocessedFieldsName
                    ],
                    processedFields=[
                        AnnotationSource(name=field, type=AnnotationSourceType.NUCLEOTIDE_SEQUENCE)
                        for field in error.processedFieldsName
                    ],
                    message=error.message,
                )
                for error in metadata_errors if error.type == AnnotationSourceType.NUCLEOTIDE_SEQUENCE
            ])

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
            warnings=[
                ProcessingAnnotation(
                    unprocessedFields=[
                        AnnotationSource(
                            name=field,
                            type=AnnotationSourceType.METADATA,
                        )
                        for field in warning.unprocessedFieldsName
                    ],
                    processedFields=[
                        AnnotationSource(name=field, type=AnnotationSourceType.METADATA)
                        for field in warning.processedFieldsName
                    ],
                    message=warning.message,
                )
                for warning in metadata_warnings
            ],
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
    assert processed_entry.data.metadata == expected_output.data.metadata, (
        f"{test_name}: processed metadata {processed_entry.data.metadata} "
        f"does not match expected metadata {expected_output.data.metadata}."
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
