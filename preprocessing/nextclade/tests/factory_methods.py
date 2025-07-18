from dataclasses import dataclass
from datetime import datetime

import pytz

from loculus_preprocessing.datatypes import (
    AnnotationSource,
    AnnotationSourceType,
    ProcessedData,
    ProcessedEntry,
    ProcessedMetadataValue,
    ProcessingAnnotation,
    UnprocessedData,
    UnprocessedEntry,
)


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


@dataclass
class UnprocessedEntryFactory:
    @staticmethod
    def create_unprocessed_entry(
        metadata_dict: dict[str, str | None],
        accession_id: str,
    ) -> UnprocessedEntry:
        return UnprocessedEntry(
            accessionVersion=f"LOC_{accession_id}.1",
            data=UnprocessedData(
                submitter="test_submitter",
                submittedAt=str(
                    datetime.strptime("2021-12-15", "%Y-%m-%d").replace(tzinfo=pytz.utc).timestamp()
                ),
                metadata=metadata_dict,
                unalignedNucleotideSequences={"main": ""},
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
    ) -> ProcessedEntry:
        if metadata_errors is None:
            metadata_errors = []
        if metadata_warnings is None:
            metadata_warnings = []
        if self.all_metadata_fields is None:
            self.all_metadata_fields = []
        base_metadata_dict = dict.fromkeys(self.all_metadata_fields)
        base_metadata_dict.update(metadata_dict)

        return ProcessedEntry(
            accession=accession,
            version=1,
            data=ProcessedData(
                metadata=base_metadata_dict,
                unalignedNucleotideSequences={"main": ""},
                alignedNucleotideSequences={"main": None},
                nucleotideInsertions={"main": []},
                alignedAminoAcidSequences={},
                aminoAcidInsertions={},
            ),
            errors=[
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
                for error in metadata_errors
            ],
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
