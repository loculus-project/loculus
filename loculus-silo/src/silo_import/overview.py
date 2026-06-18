from __future__ import annotations

import json
import logging
import os
import shutil
import time
from collections.abc import Callable, Iterator, Mapping
from dataclasses import dataclass
from datetime import date, datetime
from io import TextIOWrapper
from itertools import starmap
from pathlib import Path
from typing import Any

import duckdb
import requests
import yaml
import zstandard

from .constants import DATA_FILENAME, SPECIAL_ETAG_NONE, TRANSFORMED_DATA_FILENAME
from .download_manager import (
    _create_download_directory,
    _download_file,
    _handle_previous_directory,
)
from .errors import HashUnchangedError, NotModifiedError
from .filesystem import prune_timestamped_directories, safe_remove
from .instruct_silo import SiloRunner
from .paths import ImporterPaths
from .transformer import transform_data_format

logger = logging.getLogger(__name__)

DownloadFunc = Callable[[str, Path, str | None, int], Any]
HTTP_BAD_REQUEST = 400


@dataclass(frozen=True)
class OverviewImporterConfig:
    backend_base_urls: dict[str, str]
    organism_display_names: dict[str, str]
    query_file: Path
    database_config: Path
    hard_refresh_interval: int
    poll_interval: int
    silo_run_timeout: int
    root_dir: Path
    silo_binary: Path
    preprocessing_config: Path
    sequence_config_file: Path

    @classmethod
    def from_env(cls) -> OverviewImporterConfig:
        env = os.environ
        backend_base_urls = _json_env_dict(env, "OVERVIEW_BACKEND_BASE_URLS")
        if not backend_base_urls:
            msg = "OVERVIEW_BACKEND_BASE_URLS environment variable is required"
            raise RuntimeError(msg)

        query_file = Path(env.get("OVERVIEW_QUERY_FILE", "/app/overview_query.sql"))
        if not query_file.exists():
            msg = f"OVERVIEW_QUERY_FILE does not exist: {query_file}"
            raise RuntimeError(msg)

        database_config = Path(
            env.get("OVERVIEW_DATABASE_CONFIG", "/preprocessing/input/database_config.yaml")
        )
        if not database_config.exists():
            msg = f"OVERVIEW_DATABASE_CONFIG does not exist: {database_config}"
            raise RuntimeError(msg)

        root_raw = env.get("ROOT_DIR")
        root_dir = Path(root_raw).resolve() if root_raw else Path("/")

        return cls(
            backend_base_urls={key: value.rstrip("/") for key, value in backend_base_urls.items()},
            organism_display_names=_json_env_dict(env, "OVERVIEW_ORGANISM_DISPLAY_NAMES"),
            query_file=query_file,
            database_config=database_config,
            hard_refresh_interval=int(env.get("HARD_REFRESH_INTERVAL", "3600")),
            poll_interval=int(env.get("SILO_IMPORT_POLL_INTERVAL_SECONDS", "30")),
            silo_run_timeout=int(env.get("SILO_RUN_TIMEOUT_SECONDS", "3600")),
            root_dir=root_dir,
            silo_binary=Path(env.get("PATH_TO_SILO_BINARY", "/usr/local/bin/silo")),
            preprocessing_config=Path(
                env.get("PREPROCESSING_CONFIG", "/app/preprocessing_config.yaml")
            ),
            sequence_config_file=Path(
                env.get("OVERVIEW_SEQUENCE_CONFIG_FILE", "/app/view_sequence_config.json")
            ),
        )

    def released_data_endpoint(self, organism_key: str) -> str:
        return f"{self.backend_base_urls[organism_key]}/get-released-data?compression=zstd"


@dataclass
class OverviewDownloadResult:
    directory: Path
    transformed_path: Path
    transformed_paths: dict[str, Path]
    etag: str


@dataclass(frozen=True)
class ViewSequenceConfig:
    enabled: bool
    segments: list[str]
    source_segments: dict[str, dict[str, str]]

    def source_segment(self, organism_key: str, view_segment: str) -> str:
        return self.source_segments.get(view_segment, {}).get(organism_key, view_segment)


class OverviewImporterRunner:
    def __init__(
        self,
        config: OverviewImporterConfig,
        paths: ImporterPaths,
        download_func: DownloadFunc | None = None,
    ) -> None:
        self.config = config
        self.paths = paths
        self.paths.ensure_directories()
        self._clear_download_directories()
        self.silo = SiloRunner(paths.silo_binary, paths.preprocessing_config)
        self.download_func = download_func or _download_file
        self.current_etags: dict[str, str] = {}
        self.last_hard_refresh: float = 0

    def _clear_download_directories(self) -> None:
        if not self.paths.input_dir.exists():
            return
        for item in self.paths.input_dir.iterdir():
            if item.is_dir() and item.name.isdigit():
                logger.info("Clearing download directory on startup: %s", item)
                safe_remove(item)

    def run_once(self) -> None:
        prune_timestamped_directories(self.paths.output_dir)
        hard_refresh = time.time() - self.last_hard_refresh >= self.config.hard_refresh_interval
        etags = None if hard_refresh else self.current_etags

        try:
            download = self.download_release(etags)
        except (NotModifiedError, HashUnchangedError) as skip:
            logger.info("Skipping overview run: %s", skip)
            if hard_refresh:
                self.last_hard_refresh = time.time()
            return

        safe_remove(self.paths.silo_input_data_path)
        shutil.copyfile(download.transformed_path, self.paths.silo_input_data_path)

        try:
            self.silo.run_preprocessing(self.config.silo_run_timeout)
        except Exception:
            logger.exception("Overview SILO preprocessing failed; cleaning up input")
            safe_remove(self.paths.silo_input_data_path)
            safe_remove(download.directory)
            raise

        self.current_etags = json.loads(download.etag)
        if hard_refresh:
            self.last_hard_refresh = time.time()
        logger.info("Overview run complete; waiting %s seconds", self.config.poll_interval)

    def download_release(self, etags: dict[str, str] | None) -> OverviewDownloadResult:
        logger.info("Starting overview download")
        download_dir = _create_download_directory(self.paths.input_dir)

        try:
            downloaded_paths, response_etags = self._download_all(download_dir, etags)
            return self._build_overview(download_dir, downloaded_paths, response_etags)
        except Exception:
            safe_remove(download_dir)
            raise

    def _build_overview(
        self,
        download_dir: Path,
        downloaded_paths: dict[str, Path],
        response_etags: dict[str, str],
    ) -> OverviewDownloadResult:
        transformed_path = download_dir / TRANSFORMED_DATA_FILENAME
        transformed_paths = self._transform_all(download_dir, downloaded_paths)
        self._execute_overview_query(transformed_paths, transformed_path)

        combined_etag = json.dumps(response_etags, sort_keys=True)
        _handle_previous_directory(self.paths, download_dir, transformed_path, combined_etag)
        prune_timestamped_directories(self.paths.input_dir)
        logger.info("Rebuilt overview from %s organisms", len(transformed_paths))
        return OverviewDownloadResult(
            download_dir,
            transformed_path,
            transformed_paths,
            combined_etag,
        )

    def _download_all(
        self,
        download_dir: Path,
        etags: dict[str, str] | None,
    ) -> tuple[dict[str, Path], dict[str, str]]:
        first_pass_paths, first_pass_etags, not_modified = self._download_pass(download_dir, etags)
        if etags and len(not_modified) == len(self.config.backend_base_urls):
            raise NotModifiedError
        if etags and not_modified:
            for path in first_pass_paths.values():
                safe_remove(path)
            return self._download_pass(download_dir, None)[:2]
        return first_pass_paths, first_pass_etags

    def _download_pass(
        self,
        download_dir: Path,
        etags: dict[str, str] | None,
    ) -> tuple[dict[str, Path], dict[str, str], set[str]]:
        downloaded_paths: dict[str, Path] = {}
        response_etags: dict[str, str] = {}
        not_modified: set[str] = set()

        for organism_key in self.config.backend_base_urls:
            path = download_dir / f"{organism_key}-{DATA_FILENAME}"
            response = self.download_func(
                self.config.released_data_endpoint(organism_key),
                path,
                etags.get(organism_key, SPECIAL_ETAG_NONE) if etags else SPECIAL_ETAG_NONE,
                300,
            )
            if response.status_code == requests.codes.not_modified:
                not_modified.add(organism_key)
                safe_remove(path)
                continue
            if response.status_code >= HTTP_BAD_REQUEST:
                body = (
                    path.read_text(encoding="utf-8", errors="replace")
                    if path.exists()
                    else "missing"
                )
                msg = (
                    f"Failed to download {organism_key}: HTTP {response.status_code}. Body: {body}"
                )
                raise RuntimeError(msg)

            etag = response.headers.get("etag")
            if not etag:
                msg = f"{organism_key} response did not contain an ETag header"
                raise RuntimeError(msg)
            response_etags[organism_key] = etag
            downloaded_paths[organism_key] = path

        return downloaded_paths, response_etags, not_modified

    def _transform_all(
        self,
        download_dir: Path,
        downloaded_paths: dict[str, Path],
    ) -> dict[str, Path]:
        transformed_paths: dict[str, Path] = {}
        for organism_key, raw_path in downloaded_paths.items():
            transformed_path = download_dir / f"{organism_key}.ndjson.zst"
            transform_data_format(raw_path, transformed_path)
            transformed_paths[organism_key] = transformed_path
        return transformed_paths

    def _execute_overview_query(
        self,
        transformed_paths: dict[str, Path],
        output_path: Path,
    ) -> None:
        query = self.config.query_file.read_text(encoding="utf-8").strip()
        if not query:
            msg = f"Overview query file is empty: {self.config.query_file}"
            raise RuntimeError(msg)

        logger.info("Executing overview query from %s", self.config.query_file)
        configured_source_columns = _configured_source_columns(self.config.database_config)
        sequence_config = _read_view_sequence_config(self.config.sequence_config_file)
        sequences_by_accession = (
            _collect_unaligned_sequences(sequence_config, transformed_paths)
            if sequence_config.enabled
            else {}
        )
        sequence_columns = (
            [
                column
                for segment in sequence_config.segments
                for column in (segment, f"unaligned_{segment}")
            ]
            if sequence_config.enabled
            else []
        )
        with duckdb.connect(database=":memory:") as connection:
            for organism_key, transformed_path in transformed_paths.items():
                _register_source_view(
                    connection, organism_key, transformed_path, configured_source_columns
                )

            cursor = connection.execute(query)
            columns = [description[0] for description in cursor.description or []]
            _write_query_result_ndjson_zst(
                cursor, columns, output_path, sequence_columns, sequences_by_accession
            )


def _register_source_view(
    connection: duckdb.DuckDBPyConnection,
    organism_key: str,
    transformed_path: Path,
    configured_columns: dict[str, str],
) -> None:
    if _zstd_contains_non_whitespace(transformed_path):
        raw_view_name = f"__raw_{organism_key}"
        connection.execute(
            f"CREATE VIEW {_quote_identifier(raw_view_name)} AS "  # noqa: S608
            f"SELECT * FROM read_json({_quote_string(str(transformed_path))}, "
            "format = 'newline_delimited')"
        )
        source_columns = _source_columns(connection, raw_view_name)
        view_sql = _create_typed_view_sql(
            organism_key, raw_view_name, source_columns, configured_columns
        )
        connection.execute(view_sql)
        return

    logger.info("Creating empty overview view for %s", organism_key)
    connection.execute(_create_empty_view_sql(organism_key, configured_columns))


def _source_columns(connection: duckdb.DuckDBPyConnection, view_name: str) -> list[str]:
    rows = connection.execute(
        f"DESCRIBE SELECT * FROM {_quote_identifier(view_name)}"  # noqa: S608
    ).fetchall()
    return [row[0] for row in rows]


def _create_typed_view_sql(
    organism_key: str,
    raw_view_name: str,
    source_columns: list[str],
    configured_columns: dict[str, str],
) -> str:
    select_expressions: list[str] = []
    source_column_set = set(source_columns)

    for column_name in source_columns:
        if column_name in configured_columns:
            select_expressions.append(
                f"CAST({_quote_identifier(column_name)} AS {configured_columns[column_name]}) "
                f"AS {_quote_identifier(column_name)}"
            )
        else:
            select_expressions.append(_quote_identifier(column_name))

    for column_name, duckdb_type in configured_columns.items():
        if column_name not in source_column_set:
            select_expressions.append(_null_column_sql(column_name, duckdb_type))

    columns = ", ".join(select_expressions)
    return (
        f"CREATE VIEW {_quote_identifier(organism_key)} AS "  # noqa: S608
        f"SELECT {columns} FROM {_quote_identifier(raw_view_name)}"
    )


def _create_empty_view_sql(
    organism_key: str,
    configured_columns: dict[str, str],
) -> str:
    columns = ", ".join(starmap(_null_column_sql, configured_columns.items()))
    return f"CREATE VIEW {_quote_identifier(organism_key)} AS SELECT {columns} WHERE false"


def _null_column_sql(column_name: str, duckdb_type: str) -> str:
    return f"CAST(NULL AS {duckdb_type}) AS {_quote_identifier(column_name)}"


def _configured_source_columns(database_config: Path) -> dict[str, str]:
    config = yaml.safe_load(database_config.read_text(encoding="utf-8")) or {}
    schema = config.get("schema", {})
    metadata = schema.get("metadata", [])
    if not isinstance(metadata, list):
        msg = f"{database_config} must contain schema.metadata as a list"
        raise TypeError(msg)

    columns: dict[str, str] = {}
    for field in metadata:
        if isinstance(field, dict) and isinstance(field.get("name"), str):
            columns[field["name"]] = _duckdb_type(field.get("type"))

    # The overview query may normalize organism-specific source names into the
    # manual output schema. These aliases let empty sources participate in UNIONs.
    columns.setdefault("geoLocCountry", "VARCHAR")
    columns.setdefault("sampleCollectionDate", "VARCHAR")
    columns.setdefault("country", "VARCHAR")
    columns.setdefault("date", "VARCHAR")
    return columns


def _duckdb_type(silo_type: Any) -> str:
    return {
        "boolean": "BOOLEAN",
        "date": "DATE",
        "float": "DOUBLE",
        "int": "BIGINT",
        "string": "VARCHAR",
        "timestamp": "BIGINT",
    }.get(str(silo_type), "VARCHAR")


def _zstd_contains_non_whitespace(path: Path) -> bool:
    decompressor = zstandard.ZstdDecompressor()
    with path.open("rb") as handle, decompressor.stream_reader(handle) as reader:
        while chunk := reader.read(8192):
            if chunk.strip():
                return True
    return False


def _read_view_sequence_config(path: Path) -> ViewSequenceConfig:
    if not path.exists():
        return ViewSequenceConfig(enabled=False, segments=[], source_segments={})

    data = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(data, dict):
        msg = f"{path} must contain a JSON object"
        raise TypeError(msg)
    unaligned = data.get("unalignedNucleotideSequences", {})
    if not isinstance(unaligned, dict):
        msg = f"{path} field unalignedNucleotideSequences must be an object"
        raise TypeError(msg)

    enabled = unaligned.get("enabled") is True
    segments = unaligned.get("segments", [])
    source_segments = unaligned.get("sourceSegments", {})
    if not isinstance(segments, list) or not all(isinstance(segment, str) for segment in segments):
        msg = f"{path} field unalignedNucleotideSequences.segments must be a string array"
        raise TypeError(msg)
    if not _is_nested_string_dict(source_segments):
        msg = (
            f"{path} field unalignedNucleotideSequences.sourceSegments must map strings to strings"
        )
        raise TypeError(msg)

    return ViewSequenceConfig(
        enabled=enabled and bool(segments),
        segments=segments,
        source_segments=source_segments,
    )


def _collect_unaligned_sequences(
    sequence_config: ViewSequenceConfig,
    transformed_paths: dict[str, Path],
) -> dict[str, dict[str, str]]:
    sequences_by_accession: dict[str, dict[str, str]] = {}

    for organism_key, transformed_path in transformed_paths.items():
        target_to_source_fields: dict[str, str] = {}
        for view_segment in sequence_config.segments:
            source_field = f"unaligned_{sequence_config.source_segment(organism_key, view_segment)}"
            target_to_source_fields[view_segment] = source_field
            target_to_source_fields[f"unaligned_{view_segment}"] = source_field
        if not _zstd_contains_non_whitespace(transformed_path):
            continue
        for record in _read_zstd_ndjson(transformed_path):
            accession_version = record.get("accessionVersion")
            if accession_version is None:
                continue
            accession_key = str(accession_version)
            target_record = sequences_by_accession.setdefault(accession_key, {})
            for target_field, source_field in target_to_source_fields.items():
                sequence = record.get(source_field)
                if sequence is None:
                    continue
                if not isinstance(sequence, str):
                    msg = f"{source_field} for {accession_key} in {organism_key} is not a string"
                    raise TypeError(msg)
                existing = target_record.get(target_field)
                if existing is not None and existing != sequence:
                    msg = (
                        f"Conflicting {target_field} sequence for accessionVersion {accession_key}"
                    )
                    raise RuntimeError(msg)
                target_record[target_field] = sequence

    return {key: value for key, value in sequences_by_accession.items() if value}


def _read_zstd_ndjson(path: Path) -> Iterator[dict[str, Any]]:
    decompressor = zstandard.ZstdDecompressor()
    with (
        path.open("rb") as handle,
        decompressor.stream_reader(handle) as reader,
        TextIOWrapper(reader, encoding="utf-8") as text_reader,
    ):
        for line in text_reader:
            if not line.strip():
                continue
            record = json.loads(line)
            if not isinstance(record, dict):
                msg = f"{path} contains a non-object NDJSON record"
                raise TypeError(msg)
            yield record


def _is_nested_string_dict(value: Any) -> bool:
    if not isinstance(value, dict):
        return False
    return all(
        isinstance(outer_key, str)
        and isinstance(inner, dict)
        and all(
            isinstance(inner_key, str) and isinstance(inner_value, str)
            for inner_key, inner_value in inner.items()
        )
        for outer_key, inner in value.items()
    )


def _json_env_dict(env: Mapping[str, str], key: str) -> dict[str, str]:
    raw = env.get(key)
    if not raw:
        return {}
    data = json.loads(raw)
    if not isinstance(data, dict) or not all(
        isinstance(k, str) and isinstance(v, str) for k, v in data.items()
    ):
        msg = f"{key} must be a JSON object with string values"
        raise RuntimeError(msg)
    return data


def _write_query_result_ndjson_zst(
    cursor: Any,
    columns: list[str],
    path: Path,
    sequence_columns: list[str] | None = None,
    sequences_by_accession: dict[str, dict[str, str]] | None = None,
) -> None:
    if sequence_columns and "accessionVersion" not in columns:
        msg = "View sequence support requires the SQL query to return accessionVersion"
        raise RuntimeError(msg)

    compressor = zstandard.ZstdCompressor()
    record_count = 0
    with path.open("wb") as handle, compressor.stream_writer(handle) as writer:
        while rows := cursor.fetchmany(10_000):
            for row in rows:
                record = {
                    column: _json_value(value) for column, value in zip(columns, row, strict=True)
                }
                if sequence_columns:
                    _attach_sequence_columns(record, sequence_columns, sequences_by_accession)
                writer.write(json.dumps(record, separators=(",", ":")).encode("utf-8"))
                writer.write(b"\n")
                record_count += 1
    logger.info("Overview query wrote %s records to %s", record_count, path)


def _attach_sequence_columns(
    record: dict[str, Any],
    sequence_columns: list[str],
    sequences_by_accession: dict[str, dict[str, str]] | None,
) -> None:
    accession_version = record.get("accessionVersion")
    attached_sequences = (
        sequences_by_accession.get(str(accession_version), {})
        if accession_version is not None and sequences_by_accession
        else {}
    )
    for sequence_column in sequence_columns:
        if not sequence_column.startswith("unaligned_"):
            record[sequence_column] = None
            continue
        sequence = attached_sequences.get(sequence_column)
        record[sequence_column] = sequence


def _json_value(value: Any) -> Any:
    if isinstance(value, date | datetime):
        return value.isoformat()
    return value


def _quote_identifier(value: str) -> str:
    return '"' + value.replace('"', '""') + '"'


def _quote_string(value: str) -> str:
    return "'" + value.replace("'", "''") + "'"


def run_overview_forever(config: OverviewImporterConfig, paths: ImporterPaths) -> None:
    runner = OverviewImporterRunner(config, paths)
    while True:
        try:
            runner.run_once()
        except Exception:
            logger.exception("Overview SILO import cycle failed")
        time.sleep(config.poll_interval)
