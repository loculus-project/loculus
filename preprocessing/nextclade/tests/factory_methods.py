from dataclasses import dataclass

from loculus_preprocessing.datatypes import (
    AnnotationSource,
    AnnotationSourceType,
    ProcessedData,
    ProcessedEntry,
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
class UnprocessedEntryFactory:
    _counter: int = 0

    @classmethod
    def reset_counter(cls):
        cls._counter = 0

    @staticmethod
    def create_unprocessed_entry(
        metadata_dict: dict[str, str],
        accession: str | None = None,
    ) -> UnprocessedEntry:
        if not accession:
            accession = f"LOC_{UnprocessedEntryFactory._counter}.1"
            UnprocessedEntryFactory._counter += 1
        UnprocessedEntryFactory._counter += 1
        return UnprocessedEntry(
            accessionVersion=f"LOC_{accession}.1",
            data=UnprocessedData(
                submitter="test_submitter",
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
        metadata_dict: dict[str, str],
        accession_id: str,
        metadata_errors: list[tuple[str, str]] | None = None,
        metadata_warnings: list[tuple[str, str]] | None = None,
    ) -> ProcessedEntry:
        if metadata_errors is None:
            metadata_errors = []
        if metadata_warnings is None:
            metadata_warnings = []

        base_metadata_dict = dict.fromkeys(self.all_metadata_fields)
        base_metadata_dict.update(metadata_dict)

        return ProcessedEntry(
            accession=accession_id,
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
                    source=[AnnotationSource(name=error[0], type=AnnotationSourceType.METADATA)],
                    message=error[1],
                )
                for error in metadata_errors
            ],
            warnings=[
                ProcessingAnnotation(
                    source=[AnnotationSource(name=warning[0], type=AnnotationSourceType.METADATA)],
                    message=warning[1],
                )
                for warning in metadata_warnings
            ],
        )
