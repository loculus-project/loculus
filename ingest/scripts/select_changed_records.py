"""Compare the NCBI dataset with the previous submissions and keep only the records that need action

For non-segmented organisms this replaces format_ncbi_metadata, filter_out_depositions,
calculate_sequence_hashes, prepare_metadata, metadata_filter and compare_hashes. Those rules wrote
the whole corpus to disk several times (for SARS-CoV-2 ~85 GB of sequences, twice); here the data is
read once and only the records to submit or revise are written, so disk traffic scales with the
number of changes. Every per-record step calls the function the replaced scripts use, and the
outputs are the same files compare_hashes writes, plus the metadata and sequences that
prepare_files needs: the ndjson records of the submissions and revisions, in the order the old
metadata_post_prepare.ndjson and sequences.ndjson had them.

1. Read the sequences (genomic.fna) once: the hash of each sequence and where its record is.
2. Stream the data report in order: format, drop Loculus depositions, prepare, hash, filter, sample
   and compare each record, and write the metadata of the records to submit or revise.
3. Read just the records to submit or revise back from genomic.fna.
"""

import hashlib
import io
import logging
import struct
from collections import defaultdict
from collections.abc import Iterator
from dataclasses import dataclass
from typing import Any, BinaryIO

import click
import orjson
import yaml
from calculate_sequence_hashes import fasta_records
from compare_hashes import (
    REVISE,
    SUBMIT,
    SequenceUpdateManager,
    classify_hash,
    construct_submitted_dict,
    get_approved_submitted_accessions,
    load_muted_hashes_dict,
    process_hashes,
    sample_out_hashed_records,
    warn_potentially_suppressed,
    write_outputs,
)
from compare_hashes import load_config as load_compare_config
from filter_out_depositions import is_loculus_deposition, load_exclusions
from format_ncbi_metadata import as_tsv_record, format_row, load_ncbi_mappings, tsv_headers
from metadata_filter import passes_metadata_filter
from prepare_metadata import (
    get_keys_to_keep,
    load_segments,
    metadata_hash_prefix,
    rename_and_filter,
    resolve_host_information,
    transform,
)
from prepare_metadata import load_config as load_prepare_config

logger = logging.getLogger(__name__)
logging.basicConfig(
    encoding="utf-8",
    level=logging.DEBUG,
    format="%(asctime)s %(levelname)8s (%(filename)20s:%(lineno)4d) - %(message)s ",
    datefmt="%H:%M:%S",
)

READ_BLOCK_SIZE = 1 << 24
# A sequence as 16 bytes of MD5 digest plus the byte range of its FASTA record: one small bytes
# object per record keeps the lookup map for ~3M SARS-CoV-2 records near 0.5 GB
SEQUENCE_ENTRY = struct.Struct("<16sQQ")


@dataclass
class SequenceIndex:
    entries: dict[str, bytes]  # FASTA id -> SEQUENCE_ENTRY
    earlier_copies: dict[str, list[tuple[int, int]]]  # byte ranges of repeated FASTA ids

    def hash(self, fasta_id: str) -> str | None:
        entry = self.entries.get(fasta_id)
        return None if entry is None else entry[:16].hex()

    def byte_ranges(self, fasta_id: str) -> list[tuple[int, int]]:
        _, start, end = SEQUENCE_ENTRY.unpack_from(self.entries[fasta_id])
        return [*self.earlier_copies.get(fasta_id, []), (start, end)]

    def mark_used(self, fasta_id: str) -> bool:
        """Mark that a metadata record uses this sequence; whether one did before (a repeated id)"""
        entry = self.entries[fasta_id]
        if len(entry) > SEQUENCE_ENTRY.size:
            return True
        self.entries[fasta_id] = entry + b"\x01"
        return False


def split_fasta_records(f: BinaryIO) -> Iterator[tuple[str, bytes, int, int]]:  # noqa: C901, PLR0912
    """(id, sequence, start, end) for each record of a FASTA file opened in binary mode, with the
    byte range [start, end) of the record

    Ids and sequences are those of calculate_sequence_hashes.fasta_records on the file opened as
    text, which is what the hashes submitted before were computed from. Records are cut at "\\n>"
    in large blocks: parsing genomic.fna (wrapped at 70 columns) line by line would take a Python
    loop iteration per line. A stretch containing "\\r" is parsed by fasta_records itself, since
    text mode treats a lone "\\r" as a line break.
    """
    buffer = b""
    buffer_start = 0  # file offset of buffer[0]
    at_eof = False
    in_record = False  # whether buffer starts at a record ("\\n>" or ">" at the start of the file)
    while True:
        if not at_eof:
            block = f.read(READ_BLOCK_SIZE)
            at_eof = not block
            buffer += block
        position = 0
        if not in_record:
            # Before the first record: fasta_records skips lines until the first header
            first = 0 if buffer.startswith(b">") else buffer.find(b"\n>")
            if first < 0 and not at_eof:
                continue
            first = len(buffer) if first < 0 else first + (buffer[first] != ord(">"))
            if b"\r" in buffer[:first]:
                yield from _parse_as_text(buffer[:first], buffer_start, buffer_start + first)
            position = first
            in_record = True
        while position < len(buffer):
            next_record = buffer.find(b"\n>", position + 1)
            if next_record < 0:
                if not at_eof:
                    break
                end = len(buffer)
            else:
                end = next_record + 1
            start_offset, end_offset = buffer_start + position, buffer_start + end
            if buffer.find(b"\r", position, end) >= 0:
                yield from _parse_as_text(buffer[position:end], start_offset, end_offset)
            else:
                header_end = buffer.find(b"\n", position, end)
                if header_end < 0:
                    header_end = end
                title = buffer[position + 1 : header_end].decode("utf-8")
                name = title.split(None, 1)[0] if title.strip() else ""
                sequence = buffer[header_end + 1 : end].replace(b"\n", b"").replace(b" ", b"")
                yield name, sequence, start_offset, end_offset
            position = end
        buffer_start += position
        buffer = buffer[position:]
        if at_eof and not buffer:
            return


def _parse_as_text(chunk: bytes, start: int, end: int) -> Iterator[tuple[str, bytes, int, int]]:
    text = io.StringIO(chunk.decode("utf-8"), newline=None)  # universal newlines, as open() does
    for name, sequence in fasta_records(text):
        yield name, sequence.encode(), start, end


def index_sequences(sequences_path: str) -> SequenceIndex:
    index = SequenceIndex(entries={}, earlier_copies={})
    with open(sequences_path, "rb") as f:
        for name, sequence, start, end in split_fasta_records(f):
            digest = hashlib.md5(sequence, usedforsecurity=False).digest()
            previous = index.entries.get(name)
            if previous is not None:
                # The hash of the last copy counts (calculate_sequence_hashes -> prepare_metadata
                # build a dict), and prepare_files writes every copy
                _, previous_start, previous_end = SEQUENCE_ENTRY.unpack(previous)
                index.earlier_copies.setdefault(name, []).append((previous_start, previous_end))
            index.entries[name] = SEQUENCE_ENTRY.pack(digest, start, end)
    logger.info(f"Hashed {len(index.entries)} sequences")
    return index


def write_sequences(
    sequences_path: str, index: SequenceIndex, fasta_ids: set[str], output: str
) -> None:
    """Sequences of fasta_ids as sequences.ndjson records, in the order of the FASTA file"""
    byte_ranges = sorted({r for fasta_id in fasta_ids for r in index.byte_ranges(fasta_id)})
    count = 0
    with open(sequences_path, "rb") as f, open(output, "wb") as out:
        for start, end in byte_ranges:
            f.seek(start)
            chunk = io.BytesIO(f.read(end - start))
            for name, sequence, _, _ in split_fasta_records(chunk):
                if name in fasta_ids:
                    out.write(orjson.dumps({"id": name, "sequence": sequence.decode()}) + b"\n")
                    count += 1
    logger.info(f"Wrote {count} sequences to {output}")


def loads(line: bytes) -> Any:
    try:
        return orjson.loads(line)
    except orjson.JSONDecodeError:
        # json accepts what orjson rejects (integers beyond 64 bits, lone surrogates)
        import json  # noqa: PLC0415

        return json.loads(line)


@dataclass
class RecordPreparer:
    """format_ncbi_metadata -> filter_out_depositions -> prepare_metadata -> metadata_filter for one
    data report line; None if a filter drops it"""

    full_config: dict[str, Any]
    exclude_insdc_accessions: str | None
    segments: str | None

    def __post_init__(self):
        self.ncbi_mappings = load_ncbi_mappings(self.full_config)
        self.headers = tsv_headers(self.ncbi_mappings)
        self.config = load_prepare_config(self.full_config)
        if self.config.segmented:
            msg = "select_changed_records is for non-segmented organisms"
            raise ValueError(msg)
        self.keys_to_keep = get_keys_to_keep(self.config)
        self.fasta_id_field = self.config.rename.get(
            self.config.fasta_id_field, self.config.fasta_id_field
        )
        self.segments_dict, self.segmented_fields = load_segments(self.segments)
        self.metadata_filter: dict[str, str] = self.full_config.get("metadata_filter") or {}
        if "hash" in self.metadata_filter:
            msg = "metadata_filter on hash is not supported"
            raise ValueError(msg)
        self.exclusions = (
            load_exclusions(self.exclude_insdc_accessions)
            if self.exclude_insdc_accessions
            else None
        )

    def prepare(self, line: bytes, index: SequenceIndex) -> dict[str, str] | None:
        # the row format_ncbi_metadata writes to the TSV, as filter_out_depositions and
        # prepare_metadata read it back
        record = as_tsv_record(format_row(loads(line), self.ncbi_mappings), self.headers)
        if self.exclusions and is_loculus_deposition(
            record["genbankAccession"], record["biosampleAccession"], *self.exclusions
        ):
            return None
        record = transform(record, self.config, self.segments_dict, self.segmented_fields)
        rename_and_filter(record, self.config, self.keys_to_keep)
        sequence_hash = index.hash(record[self.fasta_id_field])
        if not sequence_hash:
            msg = f"No hash found for {record[self.fasta_id_field]}"
            raise ValueError(msg)
        prehash = metadata_hash_prefix(record) + sequence_hash
        record["hash"] = hashlib.md5(prehash.encode(), usedforsecurity=False).hexdigest()
        resolve_host_information(record)
        if self.metadata_filter and not passes_metadata_filter(record, self.metadata_filter):
            return None
        return record


def write_metadata(out, metadata_id: str, record: dict[str, str]) -> None:
    out.write(orjson.dumps({"id": metadata_id, "metadata": record}) + b"\n")


@click.command()
@click.option("--config-file", required=True, type=click.Path(exists=True))
@click.option("--dataset-report", required=True, type=click.Path(exists=True))
@click.option("--sequences", required=True, type=click.Path(exists=True))
@click.option("--old-hashes", required=True, type=click.Path(exists=True))
@click.option("--exclude-insdc-accessions", required=False, type=click.Path(exists=True))
@click.option("--muted-hashes", required=False, type=click.Path(exists=True))
@click.option("--segments", required=False, type=click.Path(exists=True))
@click.option("--subsample-fraction", required=True, type=float)
@click.option("--to-submit", required=True, type=click.Path())
@click.option("--to-revise", required=True, type=click.Path())
@click.option("--to-revoke", required=True, type=click.Path())
@click.option("--unchanged", required=True, type=click.Path())
@click.option("--output-blocked", required=True, type=click.Path())
@click.option("--sampled-out-file", required=True, type=click.Path())
@click.option("--output-metadata", required=True, type=click.Path())
@click.option("--output-sequences", required=True, type=click.Path())
@click.option(
    "--log-level",
    default="INFO",
    type=click.Choice(["DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"]),
)
def main(  # noqa: PLR0913, PLR0917
    config_file: str,
    dataset_report: str,
    sequences: str,
    old_hashes: str,
    exclude_insdc_accessions: str | None,
    muted_hashes: str | None,
    segments: str | None,
    subsample_fraction: float,
    to_submit: str,
    to_revise: str,
    to_revoke: str,
    unchanged: str,
    output_blocked: str,
    sampled_out_file: str,
    output_metadata: str,
    output_sequences: str,
    log_level: str,
) -> None:
    logger.setLevel(log_level)
    logging.getLogger("requests").setLevel(logging.WARNING)
    logging.getLogger("urllib3").setLevel(logging.WARNING)
    with open(config_file, encoding="utf-8") as file:
        full_config = yaml.safe_load(file)
    config = load_compare_config(config_file)
    preparer = RecordPreparer(full_config, exclude_insdc_accessions, segments)

    submitted = construct_submitted_dict(old_hashes, [], config)
    # what is left of it after the report are the accessions no longer in the report
    potentially_suppressed = get_approved_submitted_accessions(submitted)
    update_manager = SequenceUpdateManager(
        submit=[],
        revise={},
        noop={},
        blocked=defaultdict(dict),
        revoke={},
        sampled_out=[],
        hashes=[],
        config=config,
        muted_hashes=load_muted_hashes_dict(muted_hashes) if muted_hashes else {},
    )
    logger.info(f"Previously submitted INSDC accessions: {len(submitted)}")

    index = index_sequences(sequences)

    repeated_ids = False
    count = 0
    with open(dataset_report, "rb") as report, open(output_metadata, "wb") as metadata_out:
        for line in report:
            record = preparer.prepare(line, index)
            if record is None:
                continue
            count += 1
            metadata_id = record[preparer.fasta_id_field]
            repeated_ids |= index.mark_used(metadata_id)
            insdc_accession_base = record["insdcAccessionBase"]
            if not insdc_accession_base:
                msg = "Ingested sequences without INSDC accession base - potential internal error"
                raise ValueError(msg)
            if sample_out_hashed_records(insdc_accession_base, subsample_fraction):
                update_manager.sampled_out.append(insdc_accession_base)
                continue
            potentially_suppressed.discard(insdc_accession_base)
            decision = classify_hash(
                insdc_accession_base, record["hash"], submitted, update_manager.muted_hashes
            )
            process_hashes(insdc_accession_base, metadata_id, record, submitted, update_manager)
            if decision in {SUBMIT, REVISE}:
                write_metadata(metadata_out, metadata_id, record)
    logger.info(f"Compared {count} records")

    to_write = set(update_manager.submit) | set(update_manager.revise)
    if repeated_ids:
        # prepare_files writes every record whose id is to be submitted or revised, including an
        # unchanged record sharing an id with a changed one: rewrite the metadata the same way
        logger.warning("Repeated ids in the data report: selecting their records again")
        with open(dataset_report, "rb") as report, open(output_metadata, "wb") as metadata_out:
            for line in report:
                record = preparer.prepare(line, index)
                if record is not None and record[preparer.fasta_id_field] in to_write:
                    write_metadata(metadata_out, record[preparer.fasta_id_field], record)

    write_sequences(sequences, index, to_write, output_sequences)
    write_outputs(
        update_manager,
        to_submit=to_submit,
        to_revise=to_revise,
        unchanged=unchanged,
        output_blocked=output_blocked,
        to_revoke=to_revoke,
        sampled_out_file=sampled_out_file,
    )
    warn_potentially_suppressed(config, potentially_suppressed, set())


if __name__ == "__main__":
    main()
