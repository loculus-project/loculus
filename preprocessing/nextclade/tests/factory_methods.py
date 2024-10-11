from dataclasses import dataclass, field

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
class TestCase:
    name: str
    input: UnprocessedEntry
    expected_output: ProcessedEntry

@dataclass
class UnprocessedEntryFactory:
    _counter: int = 0

    @staticmethod
    def create_unprocessed_entry(
        metadata_dict: dict[str, str],
    ) -> UnprocessedEntry:
        unique_id = str(UnprocessedEntryFactory._counter)
        UnprocessedEntryFactory._counter += 1
        return UnprocessedEntry(
            accessionVersion="LOC_" + unique_id + ".1",
            data=UnprocessedData(
                submitter="test_submitter",
                metadata=metadata_dict,
                unalignedNucleotideSequences={"main": ""},
            ),
        )


@dataclass
class ProcessedEntryFactory:
    _counter: int = 0
    _all_metadata_fields: list[str] | None = field(default=None)

    def __init__(self, all_metadata_fields: list[str] | None = None):
        if all_metadata_fields is not None:
            self._all_metadata_fields = all_metadata_fields

    def create_processed_entry(
        self,
        metadata_dict: dict[str, str],
        metadata_errors: list[tuple[str, str]] | None = None,
        metadata_warnings: list[tuple[str, str]] | None = None,
    ) -> ProcessedEntry:
        if metadata_errors is None:
            metadata_errors = []
        if metadata_warnings is None:
            metadata_warnings = []
        if self._all_metadata_fields:
            base_metadata_dict = dict.fromkeys(self._all_metadata_fields)
            base_metadata_dict.update(metadata_dict)
        else:
            base_metadata_dict = metadata_dict
        unique_id = str(ProcessedEntryFactory._counter)
        ProcessedEntryFactory._counter += 1
        return ProcessedEntry(
            accession="LOC_" + unique_id,
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