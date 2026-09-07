# ruff: noqa: S101

import threading
from unittest.mock import MagicMock

from loculus_preprocessing.config import Config
from loculus_preprocessing.datatypes import (
    FileCategory,
    FileIdAndNameAndReadUrl,
    ProcessingAnnotation,
    UnprocessedData,
    UnprocessedEntry,
)
from loculus_preprocessing.external_services import FileProcessingService
from loculus_preprocessing.prepro import process_all


class ConcurrencyRecordingService(FileProcessingService):
    """Stands in for the raw reads processing service and records how many calls overlap"""

    def __init__(self, entries_expected: int) -> None:
        super().__init__(raw_reads_processing_service_url=None)
        self.max_in_flight = 0
        self.accession_versions: list[str] = []
        self._in_flight = 0
        self._lock = threading.Lock()
        # Every call waits for all the others, so a serial caller would hang here
        self._barrier = threading.Barrier(entries_expected, timeout=10)

    def process_files(
        self,
        files: dict[FileCategory, list[FileIdAndNameAndReadUrl]],
        accession_version: str,
    ) -> list[ProcessingAnnotation]:
        with self._lock:
            self._in_flight += 1
            self.max_in_flight = max(self.max_in_flight, self._in_flight)
            self.accession_versions.append(accession_version)
        self._barrier.wait()
        with self._lock:
            self._in_flight -= 1
        return []


def make_entry(index: int) -> UnprocessedEntry:
    return UnprocessedEntry(
        accessionVersion=f"LOC_{index}.1",
        data=UnprocessedData(
            submitter="test",
            group_id=1,
            submittedAt="1704067200",
            submissionId=f"submission-{index}",
            metadata={},
            unalignedNucleotideSequences={},
            files={
                FileCategory.RAW_READS: [
                    FileIdAndNameAndReadUrl(
                        fileId=f"file-{index}",
                        name=f"reads_{index}.fastq.gz",
                        url=f"http://example/file-{index}",
                    )
                ]
            },
        ),
    )


def make_config(concurrency: int) -> Config:
    # No segments, so alignment_requirement is forced to NONE and no nextclade run is needed
    return Config(organism="dummy", raw_reads_processing_concurrency=concurrency)


def test_process_all_processes_files_of_a_batch_concurrently() -> None:
    entries = [make_entry(index) for index in range(4)]
    service = ConcurrencyRecordingService(entries_expected=len(entries))
    config = make_config(concurrency=len(entries))
    config._file_processing_service = service

    results = process_all(entries, dataset_dir="unused", config=config)

    assert service.max_in_flight == len(entries)
    assert sorted(service.accession_versions) == [entry.accessionVersion for entry in entries]
    # Results stay in input order even though files were processed out of order
    assert [
        f"{result.processed_entry.accession}.{result.processed_entry.version}" for result in results
    ] == [entry.accessionVersion for entry in entries]


def test_process_all_respects_the_concurrency_limit() -> None:
    entries = [make_entry(index) for index in range(4)]
    # Two calls at a time, so the barrier is only ever released in pairs
    service = ConcurrencyRecordingService(entries_expected=2)
    config = make_config(concurrency=2)
    config._file_processing_service = service

    process_all(entries, dataset_dir="unused", config=config)

    assert service.max_in_flight == 2  # noqa: PLR2004


def test_process_all_without_files_does_not_call_the_service() -> None:
    entry = make_entry(0)
    entry.data.files = None
    service = MagicMock()
    config = make_config(concurrency=4)
    config._file_processing_service = service

    process_all([entry], dataset_dir="unused", config=config)

    service.process_files.assert_not_called()
