"""
WARNING: This script tests the full ENA submission pipeline:
    - it sends sequences to ENA dev
    - when editing always ensure `test=true`.
docker run --name test-postgres -e POSTGRES_USER=postgres -e POSTGRES_PASSWORD=unsecure \
    -e POSTGRES_DB=loculus -p 5432:5432 -d postgres
flyway -url=jdbc:postgresql://localhost:5432/loculus -schemas=ena_deposition_schema \
    -user=postgres -password=unsecure -locations=filesystem:./flyway/sql migrate
"""

# ruff: noqa: S101 (allow asserts in tests))
# ruff: noqa: PLR0915 (allow too many arguments in functions)
import json
import logging
import random
import re
import string
import uuid
from dataclasses import asdict
from datetime import datetime, timedelta
from itertools import chain, repeat
from pathlib import Path
from typing import Any, Final, cast
from unittest.mock import MagicMock, Mock, patch

import pytest
import pytz
import requests
from ena_deposition.check_external_visibility import (
    COLUMN_CONFIGS,
    EntityType,
    check_and_update_visibility_for_column,
)
from ena_deposition.config import (
    Config,
    EnaResultField,
    get_config,
)
from ena_deposition.create_assembly import (
    assembly_table_create,
    assembly_table_handle_errors,
    assembly_table_update,
)
from ena_deposition.create_assembly import (
    submission_table_start as create_assembly_submission_table_start,
)
from ena_deposition.create_assembly import (
    submission_table_update as create_assembly_submission_table_update,
)
from ena_deposition.create_project import (
    project_table_create,
    project_table_handle_errors,
)
from ena_deposition.create_project import (
    sync_state_with_submission_table as create_project_sync_state_with_submission_table,
)
from ena_deposition.create_raw_reads import raw_reads_table_create, raw_reads_table_handle_errors
from ena_deposition.create_raw_reads import (
    sync_state_with_submission_table as create_raw_reads_sync_state_with_submission_table,
)
from ena_deposition.create_sample import (
    sample_table_create,
    sample_table_handle_errors,
)
from ena_deposition.create_sample import (
    sync_state_with_submission_table as create_sample_sync_state_with_submission_table,
)
from ena_deposition.ena_submission_helper import CreationResult, create_manifest
from ena_deposition.loculus_models import Group
from ena_deposition.notifications import SlackConfig
from ena_deposition.submission_db_helper import (
    AssemblyTableEntry,
    ProjectTableEntry,
    RawReadsTableEntry,
    SampleTableEntry,
    Status,
    StatusAll,
    SubmissionTableEntry,
    add_to_db,
    db_init,
    delete_records_in_db,
    find_conditions_in_db,
    in_submission_table,
    update_db_where_conditions,
)
from ena_deposition.trigger_submission_to_ena import upload_sequences
from ena_deposition.upload_external_metadata_to_loculus import (
    get_external_metadata_and_send_to_loculus,
)
from sqlalchemy import Engine

CONFIG_FILE = "./test/test_config.yaml"
INPUT_FILE = "./test/data/approved_ena_submission_list_test.json"
# Created using `seqkit split -p 2 SRR38154636.fastq` on the interleaved SRA read file SRR38154636
RAW_READS_FIXTURE_FILE_1 = "./test/data/SRR38154636.part_001.fastq.gz"
RAW_READS_FIXTURE_FILE_2 = "./test/data/SRR38154636.part_002.fastq.gz"
# The pipeline identifies a raw-reads file by its fileId
RAW_READS_FIXTURE_BY_NAME: dict[str, dict[str, str]] = {
    "rawReads.fastq.gz": {
        "fileId": "341fac6f-c5ca-4138-ac4b-9aa9872d64d8",
        "path": RAW_READS_FIXTURE_FILE_1,
    },
    "rawReads2.fastq.gz": {
        "fileId": "341fac6f-c5ca-4138-ac4b-9aa9872d64d9",
        "path": RAW_READS_FIXTURE_FILE_2,
    },
}
TEST_ACCESSION = "LOC_0001TLY"
TEST_ACCESSION_VERSION = "LOC_0001TLY.1"
TEST_VERSION = 1


logger = logging.getLogger(__name__)

TEST_GROUP: Final = Group._create_example_for_tests()


def assert_biosample_accession(
    rows: list[SampleTableEntry], biosample_accession: str, full_accession: str
) -> None:
    assert len(rows) == 1, f"Sample for {full_accession} not found in sample table."
    if biosample_accession:
        assert rows[0].result, f"No result for sample {full_accession} in sample table."
        assert rows[0].result.get(EnaResultField.BIOSAMPLE) == biosample_accession, (
            "Incorrect biosample accession in sample table."
        )


def assert_bioproject_accession(
    rows: list[ProjectTableEntry], bioproject_accession: str, group_id: str, full_accession: str
) -> None:
    assert len(rows) == 1, f"Project {group_id} for {full_accession} not found in project table."
    if bioproject_accession:
        assert rows[0].result, f"No result for project {group_id} in project table."
        assert rows[0].result.get(EnaResultField.BIOPROJECT) == bioproject_accession, (
            "Incorrect bioproject accession in project table."
        )


def delete_all_records(db_engine: Engine) -> None:
    logger.debug("Deleting all records from all deposition tables except flyway")
    for model_class in [
        SubmissionTableEntry,
        ProjectTableEntry,
        SampleTableEntry,
        AssemblyTableEntry,
        RawReadsTableEntry,
    ]:
        delete_records_in_db(db_engine, model_class, {})


def check_sequences_uploaded(
    db_engine: Engine, sequences_to_upload: dict[str, Any], with_raw_reads: bool = False
) -> None:
    for full_accession in sequences_to_upload:
        accession, version = full_accession.split(".")
        state: dict[str, Any] = {
            "accession": accession,
            "version": version,
            "status_all": "READY_TO_SUBMIT",
        }
        if with_raw_reads:
            state["submit_raw_reads"] = True
        assert in_submission_table(db_engine, state), (
            f"Sequence {accession}.{version} not found in submission table."
        )


def check_project_submission_started(
    db_engine: Engine, sequences_to_upload: dict[str, Any]
) -> None:
    for full_accession, data in sequences_to_upload.items():
        group_id = data["metadata"]["groupId"]
        organism = data["organism"]
        assert (
            len(
                find_conditions_in_db(
                    db_engine,
                    ProjectTableEntry,
                    conditions={"group_id": group_id, "organism": organism, "status": "READY"},
                )
            )
            == 1
        ), f"Project {group_id} for {full_accession} not found in project table."


def check_sample_submission_started(db_engine: Engine, sequences_to_upload: dict[str, Any]) -> None:
    for full_accession in sequences_to_upload:
        accession, version = full_accession.split(".")
        assert (
            len(
                find_conditions_in_db(
                    db_engine,
                    SampleTableEntry,
                    conditions={"accession": accession, "version": version, "status": "READY"},
                )
            )
            == 1
        ), f"Sample for {full_accession} not found in sample table."


def check_raw_reads_submission_started(
    db_engine: Engine, sequences_to_upload: dict[str, Any]
) -> None:
    for full_accession in sequences_to_upload:
        accession, version = full_accession.split(".")
        assert (
            len(
                find_conditions_in_db(
                    db_engine,
                    RawReadsTableEntry,
                    conditions={"accession": accession, "version": version, "status": "READY"},
                )
            )
            == 1
        ), f"Raw reads for {full_accession} not found in raw reads table."


def check_sample_submission_submitted(
    db_engine: Engine, config: Config, sequences_to_upload: dict[str, Any]
) -> None:
    for full_accession, data in sequences_to_upload.items():
        accession, version = full_accession.split(".")
        rows = find_conditions_in_db(
            db_engine,
            SampleTableEntry,
            conditions={"accession": accession, "version": version, "status": "SUBMITTED"},
        )
        assert_biosample_accession(
            rows, data["metadata"][config.loculus_accession_fields.biosample], full_accession
        )
        assert in_submission_table(
            db_engine,
            {"accession": accession, "version": version, "status_all": StatusAll.SUBMITTED_SAMPLE},
        ), f"Sequence {accession}.{version} not in state SUBMITTED_SAMPLE submission table."


def check_raw_reads_submission_submitted(
    db_engine: Engine, sequences_to_upload: dict[str, Any]
) -> None:
    for full_accession in sequences_to_upload:
        accession, version = full_accession.split(".")
        rows = find_conditions_in_db(
            db_engine,
            RawReadsTableEntry,
            conditions={"accession": accession, "version": version, "status": "SUBMITTED"},
        )
        assert len(rows) == 1, f"Raw reads for {full_accession} not found in raw reads table."
        assert rows[0].result, f"No result for raw reads {full_accession} in raw reads table."
        assert not rows[0].errors, (
            f"Raw reads {full_accession} is SUBMITTED but still has errors: {rows[0].errors}"
        )
        assert in_submission_table(
            db_engine,
            {
                "accession": accession,
                "version": version,
                "status_all": StatusAll.SUBMITTED_RAW_READS,
            },
        ), f"Sequence {accession}.{version} not in state SUBMITTED_RAW_READS submission table."


def check_sample_submission_has_errors(
    db_engine: Engine, config: Config, sequences_to_upload: dict[str, Any]
) -> None:
    for full_accession, data in sequences_to_upload.items():
        accession, version = full_accession.split(".")
        rows = find_conditions_in_db(
            db_engine,
            SampleTableEntry,
            conditions={"accession": accession, "version": version, "status": "HAS_ERRORS"},
        )
        assert_biosample_accession(
            rows, data["metadata"][config.loculus_accession_fields.biosample], full_accession
        )


def check_raw_reads_submission_has_errors(
    db_engine: Engine, sequences_to_upload: dict[str, Any]
) -> None:
    for full_accession in sequences_to_upload:
        accession, version = full_accession.split(".")
        rows = find_conditions_in_db(
            db_engine,
            RawReadsTableEntry,
            conditions={"accession": accession, "version": version, "status": "HAS_ERRORS"},
        )
        assert len(rows) == 1, f"Raw reads for {full_accession} not found in raw reads table."


def check_assembly_submission_waiting(
    db_engine: Engine, sequences_to_upload: dict[str, Any]
) -> None:
    for full_accession in sequences_to_upload:
        accession, version = full_accession.split(".")
        rows = find_conditions_in_db(
            db_engine,
            AssemblyTableEntry,
            conditions={"accession": accession, "version": version, "status": "WAITING"},
        )
        assert len(rows) == 1, f"Assembly for {full_accession} not found in assembly table."
        assert rows[0].result, f"No result for assembly {full_accession} in assembly table."
        assert "erz_accession" in rows[0].result, "Incorrect assembly result in assembly table."
        assert "segment_order" in rows[0].result, "Incorrect assembly result in assembly table."


def check_assembly_submission_has_errors(
    db_engine: Engine, sequences_to_upload: dict[str, Any]
) -> None:
    for full_accession in sequences_to_upload:
        accession, version = full_accession.split(".")
        rows = find_conditions_in_db(
            db_engine,
            AssemblyTableEntry,
            conditions={"accession": accession, "version": version, "status": "HAS_ERRORS"},
        )
        assert len(rows) == 1, f"Assembly for {full_accession} not found in assembly table."


def check_assembly_submission_started(
    db_engine: Engine, sequences_to_upload: dict[str, Any]
) -> None:
    for full_accession in sequences_to_upload:
        accession, version = full_accession.split(".")
        rows = find_conditions_in_db(
            db_engine,
            AssemblyTableEntry,
            conditions={"accession": accession, "version": version, "status": "READY"},
        )
        assert len(rows) == 1, f"Assembly for {full_accession} not found in assembly table."


def check_assembly_submission_submitted(
    db_engine: Engine, sequences_to_upload: dict[str, Any]
) -> None:
    for full_accession in sequences_to_upload:
        accession, version = full_accession.split(".")
        rows = find_conditions_in_db(
            db_engine,
            AssemblyTableEntry,
            conditions={"accession": accession, "version": version, "status": "SUBMITTED"},
        )
        assert len(rows) == 1, (
            f"Assembly for {full_accession} not in state 'SUBMITTED' in assembly table."
        )
        assert in_submission_table(
            db_engine,
            {
                "accession": accession,
                "version": version,
                "status_all": StatusAll.SUBMITTED_ALL,
            },
        ), f"Sequence {accession}.{version} not in state SUBMITTED_ALL submission table."


def check_assembly_submission_with_nuc_without_gca(
    db_engine: Engine, sequences_to_upload: dict[str, Any]
) -> None:
    for full_accession in sequences_to_upload:
        accession, version = full_accession.split(".")
        rows = find_conditions_in_db(
            db_engine,
            AssemblyTableEntry,
            conditions={
                "accession": accession,
                "version": version,
                "status": "WAITING",
            },
        )
        assert len(rows) == 1, (
            f"Assembly for {full_accession} not in state 'WAITING' in assembly table."
        )
        assert rows[0].result, f"No result for assembly {full_accession} in assembly table."
        assert rows[0].result.get(f"{EnaResultField.INSDC_ACCESSION_FULL_PREFIX}_L") is not None
        assert rows[0].result.get(f"{EnaResultField.INSDC_ACCESSION_FULL_PREFIX}_M") is None
        assert rows[0].result.get(EnaResultField.GCA) is None


def check_sent_to_loculus(db_engine: Engine, sequences_to_upload: dict[str, Any]) -> None:
    for full_accession in sequences_to_upload:
        accession, version = full_accession.split(".")
        assert in_submission_table(
            db_engine,
            {
                "accession": accession,
                "version": version,
                "status_all": StatusAll.SENT_TO_LOCULUS,
            },
        ), f"Sequence {accession}.{version} not in state SENT_TO_LOCULUS submission table."


def check_project_submission_submitted(
    db_engine: Engine, config: Config, sequences_to_upload: dict[str, Any]
) -> None:
    for full_accession, data in sequences_to_upload.items():
        accession, version = full_accession.split(".")
        group_id = data["metadata"]["groupId"]
        organism = data["organism"]
        rows = find_conditions_in_db(
            db_engine,
            ProjectTableEntry,
            conditions={"group_id": group_id, "organism": organism, "status": "SUBMITTED"},
        )
        assert_bioproject_accession(
            rows,
            data["metadata"][config.loculus_accession_fields.bioproject],
            group_id,
            full_accession,
        )
        assert in_submission_table(
            db_engine,
            {"accession": accession, "version": version, "status_all": StatusAll.SUBMITTED_PROJECT},
        ), f"Sequence {accession}.{version} not in state SUBMITTED_PROJECT submission table."


def check_project_submission_has_errors(
    db_engine: Engine, config: Config, sequences_to_upload: dict[str, Any]
) -> None:
    for full_accession, data in sequences_to_upload.items():
        group_id = data["metadata"]["groupId"]
        organism = data["organism"]
        rows = find_conditions_in_db(
            db_engine,
            ProjectTableEntry,
            conditions={"group_id": group_id, "organism": organism, "status": "HAS_ERRORS"},
        )
        assert_bioproject_accession(
            rows,
            data["metadata"][config.loculus_accession_fields.bioproject],
            group_id,
            full_accession,
        )


def set_db_to_known_erz_accession(
    db_engine: Engine, sequences_to_upload: dict[str, Any], single_segment: bool
) -> None:
    """
    Sets erz-accession to known previous values that have received accession
    Account Webin-66038 (non-broker) submitted (among others):
    ERZ24985816: single segment, no GCA assigned
    ERZ24784470: 2 segments, GCA assigned
    See https://wwwdev.ebi.ac.uk/ena/submit/webin/report/analysisProcess;defaultSearch=true
    for full list of submissions
    """
    for full_accession, data in sequences_to_upload.items():
        accession, version = full_accession.split(".")
        organism = data["organism"]
        if organism == "cchf":
            segment_order = ["L"] if single_segment else ["L", "M"]
            erz_accession = "ERZ24985816" if single_segment else "ERZ24784470"
            update_db_where_conditions(
                db_engine,
                AssemblyTableEntry,
                {"accession": accession, "version": version},
                {"result": {"erz_accession": erz_accession, "segment_order": segment_order}},
            )
        if organism == "west-nile":
            update_db_where_conditions(
                db_engine,
                AssemblyTableEntry,
                {"accession": accession, "version": version},
                {"result": {"erz_accession": "ERZ24908522", "segment_order": ["main"]}},
            )


def _test_successful_assembly_submission(
    db_engine: Engine,
    config: Config,
    sequences_to_upload: dict[str, Any],
    single_segment: bool = False,
) -> None:
    create_assembly_submission_table_start(db_engine)
    check_assembly_submission_started(db_engine, sequences_to_upload)

    assert config.test, "Not submitting to dev - stopping"
    assembly_table_create(db_engine, config)
    check_assembly_submission_waiting(db_engine, sequences_to_upload)

    # Hack: ENA never processed on dev, so we set erz_accession to known public accessions
    # So we can test the rest of the pipeline
    set_db_to_known_erz_accession(db_engine, sequences_to_upload, single_segment=single_segment)
    assembly_table_update(db_engine, config, time_threshold=0)
    create_assembly_submission_table_update(db_engine)
    if single_segment:
        check_assembly_submission_with_nuc_without_gca(db_engine, sequences_to_upload)
    else:
        check_assembly_submission_submitted(db_engine, sequences_to_upload)


def _test_successful_assembly_submission_no_wait(
    db_engine: Engine, config: Config, sequences_to_upload: dict[str, Any]
) -> None:
    create_assembly_submission_table_start(db_engine)
    check_assembly_submission_started(db_engine, sequences_to_upload)

    assert config.test, "Not submitting to dev - stopping"
    assembly_table_create(db_engine, config)
    create_assembly_submission_table_update(db_engine)
    check_assembly_submission_submitted(db_engine, sequences_to_upload)


def _test_assembly_submission_errored(
    db_engine: Engine,
    config: Config,
    slack_config: SlackConfig,
    sequences_to_upload: dict[str, Any],
    mock_notify: Mock,
) -> None:
    create_assembly_submission_table_start(db_engine)
    check_assembly_submission_started(db_engine, sequences_to_upload)

    assert config.test, "Not submitting to dev - stopping"
    assembly_table_create(db_engine, config)
    check_assembly_submission_has_errors(db_engine, sequences_to_upload)

    assembly_table_handle_errors(
        db_engine,
        config,
        slack_config,
        last_retry_time=datetime.now(tz=pytz.utc),
    )
    msg = (
        f"{config.backend_url}: ENA Submission pipeline found 1 entries in assembly_table in "
        "status HAS_ERRORS or SUBMITTING for over 0m"
    )
    mock_notify.assert_called_once_with(slack_config, msg)


def _test_raw_reads_submission_errored(
    db_engine: Engine,
    config: Config,
    slack_config: SlackConfig,
    sequences_to_upload: dict[str, Any],
    mock_notify: Mock,
) -> None:
    create_raw_reads_sync_state_with_submission_table(db_engine, config)
    check_raw_reads_submission_started(db_engine, sequences_to_upload)

    assert config.test, "Not submitting to dev - stopping"
    raw_reads_table_create(db_engine, config, slack_config)
    create_raw_reads_sync_state_with_submission_table(db_engine, config)
    check_raw_reads_submission_has_errors(db_engine, sequences_to_upload)

    raw_reads_table_handle_errors(
        db_engine,
        config,
        slack_config,
        last_retry_time=datetime.now(tz=pytz.utc),
    )
    msg = (
        f"{config.backend_url}: ENA Submission pipeline found 1 entries in raw_reads_table in "
        "status HAS_ERRORS or SUBMITTING for over 0m"
    )
    mock_notify.assert_called_once_with(slack_config, msg)


def _test_successful_raw_reads_submission(
    db_engine: Engine,
    config: Config,
    sequences_to_upload: dict[str, Any],
    slack_config: SlackConfig,
) -> None:
    create_raw_reads_sync_state_with_submission_table(db_engine, config)
    check_raw_reads_submission_started(db_engine, sequences_to_upload)

    assert config.test, "Not submitting to dev - stopping"
    raw_reads_table_create(db_engine, config, slack_config)
    create_raw_reads_sync_state_with_submission_table(db_engine, config)
    check_raw_reads_submission_submitted(db_engine, sequences_to_upload)


def _test_successful_sample_submission(
    db_engine: Engine, config: Config, sequences_to_upload: dict[str, Any]
) -> None:
    create_sample_sync_state_with_submission_table(db_engine, config)
    check_sample_submission_started(db_engine, sequences_to_upload)

    sample_table_create(db_engine, config)
    create_sample_sync_state_with_submission_table(db_engine, config)
    check_sample_submission_submitted(db_engine, config, sequences_to_upload)


def _test_successful_project_submission(
    db_engine: Engine, config: Config, sequences_to_upload: dict[str, Any]
) -> None:
    create_project_sync_state_with_submission_table(db_engine, config)
    check_project_submission_started(db_engine, sequences_to_upload)

    project_table_create(db_engine, config)
    create_project_sync_state_with_submission_table(db_engine, config)
    check_project_submission_submitted(db_engine, config, sequences_to_upload)


def add_raw_reads_to_sequences(
    entry: dict[str, Any],
    config: Config,
    file_names: list[str] | None = None,
) -> None:
    if file_names is None:
        file_names = ["rawReads.fastq.gz"]

    files: list[dict[str, str]] = []
    for file_name in file_names:
        # Simulate the pre-signed S3 URL changing between versions; the fileId stays put.
        random_id = "".join(random.choices(string.digits, k=4))  # noqa: S311
        files.append(
            {
                "fileId": RAW_READS_FIXTURE_BY_NAME[file_name]["fileId"],
                "name": file_name,
                "url": f"https://loculus.org/files/{random_id}/{file_name}",
            }
        )

    entry["metadata"][config.raw_reads_metadata_field] = json.dumps(files)


def get_sequences(
    config: Config,
    with_raw_reads: bool = False,
) -> dict[str, Any]:
    with open(INPUT_FILE, encoding="utf-8") as json_file:
        sequences: dict[str, Any] = json.load(json_file)
        if with_raw_reads:
            add_raw_reads_to_sequences(sequences[TEST_ACCESSION_VERSION], config)
        return sequences


def get_revisions(
    config: Config,
    modify_assembly_manifest: bool = False,
    modify_raw_reads_manifest: bool = False,
    modify_assembly: bool = True,
    modify_raw_reads: bool = False,
    with_raw_reads: bool = False,
    set_insert_size: bool = True,
) -> dict[str, Any]:
    with open(INPUT_FILE, encoding="utf-8") as json_file:
        sequences: dict[str, Any] = json.load(json_file)
        revised_sequences: dict[str, Any] = {}
        for value in sequences.values():
            new_value = value.copy()
            accession: str = new_value["metadata"]["accession"]
            accession_version = accession + ".2"
            new_value["metadata"]["version"] = 2
            new_value["metadata"]["accessionVersion"] = accession_version
            if with_raw_reads:
                add_raw_reads_to_sequences(new_value, config)
            if modify_assembly:
                new_value["metadata"]["geoLocAdmin1"] = "revised location"
            else:
                new_value["metadata"]["hostAge"] = "revised host age"
            if modify_assembly_manifest:
                new_value["metadata"]["authors"] = "Author, Revised;"
            if modify_raw_reads_manifest:
                new_value["metadata"]["sequencingLibrarySelection"] = "ChIP"
            if modify_raw_reads:
                if set_insert_size:
                    new_value["metadata"]["pairedEndInsertSize"] = 150
                add_raw_reads_to_sequences(
                    new_value,
                    config,
                    ["rawReads.fastq.gz", "rawReads2.fastq.gz"],
                )
            revised_sequences[accession_version] = new_value
        return revised_sequences


# `requests.get` is patched module-wide, this keeps a handle to the real function
# and can be used to pass to any call that should not be mocked.
_real_requests_get = requests.get
RAW_READS_URL_PREFIX = "https://loculus.org/files/"


def mock_requests_get_fastq_side_effect(url: str, *args: Any, **kwargs: Any) -> MagicMock:
    """
    Fake `requests.get` only for the raw-reads file downloads in `download_fastq_files`,
    streaming a fixture fastq file instead of hitting S3. Every other GET is passed through
    to the real `requests.get`.
    """
    if not url.startswith(RAW_READS_URL_PREFIX):
        return _real_requests_get(url, *args, **kwargs)

    filename = url.rsplit("/", 1)[-1]
    if filename not in RAW_READS_FIXTURE_BY_NAME:
        msg = f"no raw-reads fixture registered for {url}"
        raise AssertionError(msg)
    content = Path(RAW_READS_FIXTURE_BY_NAME[filename]["path"]).read_bytes()

    response = MagicMock(spec=requests.Response)
    response.__enter__.return_value = response
    response.__exit__.return_value = False
    response.raise_for_status.return_value = None
    response.iter_content.return_value = [content]
    return response


def get_run_ref_from_raw_reads_table(db_engine: Engine, accession: str, version: int) -> str | None:
    rows = find_conditions_in_db(
        db_engine,
        RawReadsTableEntry,
        conditions={"accession": accession, "version": version},
    )
    assert len(rows) == 1, f"Raw reads for {accession}.{version} not found in raw_reads_table."
    return cast(str, rows[0].result.get(EnaResultField.RUN)) if rows[0].result else None


def mock_requests_post() -> Mock:
    mock_response = Mock()
    mock_response.status_code = 204
    mock_response.ok = True
    return mock_response


class ExternalMetadataUploads:
    """Reads `submit_external_metadata` calls in the order they happened.

    Lets a test assert on "the next upload" instead of indexing an absolute
    call number, so inserting a pipeline stage does not renumber every later
    assertion.

    Each upload's accessions are keyed by Loculus metadata field name
    (`config.loculus_accession_fields`) but the values are assigned by ENA -
    unlike the Loculus accession in the same request, which is ours.
    """

    def __init__(self, mock: Mock) -> None:
        self._mock = mock
        self._consumed = 0

    def next_upload(self) -> dict[str, Any]:
        """Assert another upload happened, and return its ENA accessions."""
        calls = self._mock.call_args_list
        assert len(calls) == self._consumed + 1, (
            f"expected exactly one new external-metadata upload (#{self._consumed + 1}), "
            f"but {len(calls) - self._consumed} happened since the last check"
        )
        payload = calls[self._consumed].args[0]
        self._consumed += 1
        assert payload["accession"] == TEST_ACCESSION
        assert payload["version"] == TEST_VERSION
        return payload["externalMetadata"]

    def assert_no_further_uploads(self) -> None:
        calls = self._mock.call_args_list
        assert len(calls) == self._consumed, (
            f"{len(calls) - self._consumed} unexpected external-metadata upload(s)"
        )


def last_external_metadata_accessions(mock: Mock) -> dict[str, Any]:
    """ENA accessions of the most recent `submit_external_metadata` call."""
    mock.assert_called()
    return mock.call_args.args[0]["externalMetadata"]


def multi_segment_submission(
    db_engine: Engine,
    config: Config,
    slack_config: SlackConfig,
    mock_get_group_info: Mock,
    mock_submit_external_metadata: Mock,
    mock_requests_get: Mock | None = None,
    single_segment: bool = False,
    with_raw_reads: bool = False,
) -> Any:
    """Test the full ENA submission pipeline with CCHF data
    If single_segment is True, there's only one segment in the assembly
    Otherwise there are 2"""
    mock_get_group_info.return_value = TEST_GROUP
    mock_submit_external_metadata.return_value = mock_requests_post()
    uploads = ExternalMetadataUploads(mock_submit_external_metadata)
    fields = config.loculus_accession_fields
    if mock_requests_get is not None:
        mock_requests_get.side_effect = mock_requests_get_fastq_side_effect
    sequences_to_upload = get_sequences(config, with_raw_reads=with_raw_reads)

    if single_segment:
        # Set segment M to None so we have only one segment in the assembly
        sequences_to_upload[TEST_ACCESSION_VERSION]["unalignedNucleotideSequences"]["M"] = None

    get_external_metadata_and_send_to_loculus(db_engine, config)
    mock_submit_external_metadata.assert_not_called()

    upload_sequences(config, db_engine, sequences_to_upload)
    check_sequences_uploaded(db_engine, sequences_to_upload)
    get_external_metadata_and_send_to_loculus(db_engine, config)
    mock_submit_external_metadata.assert_not_called()

    _test_successful_project_submission(db_engine, config, sequences_to_upload)
    get_external_metadata_and_send_to_loculus(db_engine, config)
    external_metadata_accessions = uploads.next_upload()
    assert set(external_metadata_accessions) == {fields.bioproject}
    assert external_metadata_accessions[fields.bioproject].startswith("PRJEB")

    _test_successful_sample_submission(db_engine, config, sequences_to_upload)
    get_external_metadata_and_send_to_loculus(db_engine, config)
    external_metadata_accessions = uploads.next_upload()
    assert set(external_metadata_accessions) == {fields.bioproject, fields.biosample}
    assert external_metadata_accessions[fields.bioproject].startswith("PRJEB")
    assert external_metadata_accessions[fields.biosample].startswith("SAMEA")

    if with_raw_reads:
        _test_successful_raw_reads_submission(db_engine, config, sequences_to_upload, slack_config)
        get_external_metadata_and_send_to_loculus(db_engine, config)
        external_metadata_accessions = uploads.next_upload()
        assert set(external_metadata_accessions) == {
            fields.bioproject,
            fields.biosample,
            fields.run,
        }
        assert external_metadata_accessions[fields.run].startswith("ERR")

    _test_successful_assembly_submission(db_engine, config, sequences_to_upload, single_segment)
    get_external_metadata_and_send_to_loculus(db_engine, config)
    if not single_segment:
        # Only complete in case of multi-segment submission
        check_sent_to_loculus(db_engine, sequences_to_upload)
    external_metadata_accessions = uploads.next_upload()
    extra_items = set()
    if not single_segment:
        extra_items = {
            fields.gca,
            fields.insdc_accession_prefix + "_M",
            fields.insdc_accession_full_prefix + "_M",
        }
    if with_raw_reads:
        extra_items.add(fields.run)
    assert set(external_metadata_accessions) == {
        fields.bioproject,
        fields.biosample,
        fields.insdc_accession_prefix + "_L",
        fields.insdc_accession_full_prefix + "_L",
        *extra_items,
    }
    assert external_metadata_accessions[fields.bioproject].startswith("PRJEB")
    assert external_metadata_accessions[fields.biosample].startswith("SAMEA")

    insdc_full_pattern = r"^[A-Z]{2}[0-9]{6}\.[0-9]+$"
    insdc_base_pattern = r"^[A-Z]{2}[0-9]{6}$"
    gca_pattern = r"^GCA_[0-9]{9}\.[0-9]+$"
    insdc_accession_full_l = fields.insdc_accession_full_prefix + "_L"
    insdc_accession_base_l = fields.insdc_accession_prefix + "_L"
    gca_accession = fields.gca
    assert re.match(insdc_full_pattern, external_metadata_accessions[insdc_accession_full_l]), (
        f"{insdc_accession_full_l} '{external_metadata_accessions[insdc_accession_full_l]}' "
        f"does not match INSDC full pattern {insdc_full_pattern}"
    )
    assert re.match(insdc_base_pattern, external_metadata_accessions[insdc_accession_base_l]), (
        f"{insdc_accession_base_l} '{external_metadata_accessions[insdc_accession_base_l]}' "
        f"does not match INSDC base pattern {insdc_base_pattern}"
    )
    if not single_segment:
        assert re.match(gca_pattern, external_metadata_accessions[gca_accession]), (
            f"{gca_accession} '{external_metadata_accessions[gca_accession]}' "
            f"does not match GCA pattern {gca_pattern}"
        )
    uploads.assert_no_further_uploads()
    return external_metadata_accessions


class TestSubmission:
    def setup_method(self) -> None:
        self.config: Config = get_config(CONFIG_FILE)
        self.config.submitting_time_threshold_min = 0
        self.db_engine = db_init(
            self.config.db_password, self.config.db_username, self.config.db_url
        )
        delete_all_records(self.db_engine)
        # for testing set last_notification_sent to 1 day ago
        self.slack_config = SlackConfig(
            slack_hook=self.config.slack_hook or "",
            slack_token=self.config.slack_token or "",
            slack_channel_id=self.config.slack_channel_id or "",
            last_notification_sent=datetime.now(tz=pytz.utc) - timedelta(days=1),
        )
        assert (
            self.config.ena_submission_url == "https://wwwdev.ebi.ac.uk/ena/submit/drop-box/submit"
        ), (
            f"ENA submission URL is {self.config.ena_submission_url} instead of https://wwwdev.ebi.ac.uk/ena/submit/drop-box/submit/"
        )
        assert self.config.test, "Test mode is not enabled."
        assert self.config.random_alias, (
            "Random alias is not enabled, this will cause conflicts in ENA dev if tests are run simultaneously."  # noqa: E501
        )


class TestFirstPublicUpdate(TestSubmission):
    PROJECT_CONFIG: Final = {
        "invalid_result": {EnaResultField.BIOPROJECT: "PRJEB2"},
        "valid_result": {EnaResultField.BIOPROJECT: "PRJEB53055"},
        "base_entry": {
            "group_id": 1,
            "organism": "test_organism",
            "status": Status.SUBMITTED,
        },
    }

    SAMPLE_CONFIG: Final = {
        "invalid_result": {EnaResultField.BIOSAMPLE: "SAMEA999999999"},
        "valid_result": {EnaResultField.BIOSAMPLE: "SAMEA7997453"},
        "base_entry": {
            "accession": "test_accession",
            "version": 1,
            "status": Status.SUBMITTED,
        },
    }

    NUCLEOTIDE_CONFIG: Final = {
        "invalid_result": {
            f"{EnaResultField.INSDC_ACCESSION_FULL_PREFIX}_seg1": "XY999999.1",
            f"{EnaResultField.INSDC_ACCESSION_FULL_PREFIX}_seg2": "XY999998.1",
        },
        "valid_result": {
            f"{EnaResultField.INSDC_ACCESSION_FULL_PREFIX}_seg1": "OZ271453.1",
            f"{EnaResultField.INSDC_ACCESSION_FULL_PREFIX}_seg2": "OZ271454.1",
        },
        "base_entry": {
            "accession": "test_accession",
            "version": 1,
            "status": Status.SUBMITTED,
        },
    }

    GCA_CONFIG: Final = {
        "invalid_result": {EnaResultField.GCA: "GCA_999999999.1"},
        "valid_result": {EnaResultField.GCA: "GCA_965196905.1"},
        "base_entry": {
            "accession": "test_accession",
            "version": 1,
            "status": Status.SUBMITTED,
        },
    }

    RUN_CONFIG: Final = {
        "invalid_result": {EnaResultField.RUN: "ERR999"},
        "valid_result": {EnaResultField.RUN: "ERR14673164"},
        "base_entry": {
            "accession": "test_accession",
            "version": 1,
            "status": Status.SUBMITTED,
        },
    }

    EXPERIMENT_CONFIG: Final = {
        "invalid_result": {"erx_accession": "ERX999"},
        "valid_result": {"erx_accession": "ERX14074779"},
        "base_entry": {
            "accession": "test_accession",
            "version": 1,
            "status": Status.SUBMITTED,
        },
    }

    TEST_DATA: Final = {
        (EntityType.PROJECT, "ena_first_publicly_visible"): PROJECT_CONFIG,
        (EntityType.PROJECT, "ncbi_first_publicly_visible"): PROJECT_CONFIG,
        (EntityType.SAMPLE, "ena_first_publicly_visible"): SAMPLE_CONFIG,
        (EntityType.SAMPLE, "ncbi_first_publicly_visible"): SAMPLE_CONFIG,
        (EntityType.ASSEMBLY, "ena_nucleotide_first_publicly_visible"): NUCLEOTIDE_CONFIG,
        (EntityType.ASSEMBLY, "ncbi_nucleotide_first_publicly_visible"): NUCLEOTIDE_CONFIG,
        (EntityType.ASSEMBLY, "ena_gca_first_publicly_visible"): GCA_CONFIG,
        (EntityType.RAW_READS, "ena_run_first_publicly_visible"): RUN_CONFIG,
        (EntityType.RAW_READS, "ncbi_run_first_publicly_visible"): RUN_CONFIG,
        (EntityType.RAW_READS, "ena_experiment_first_publicly_visible"): EXPERIMENT_CONFIG,
        (EntityType.RAW_READS, "ncbi_experiment_first_publicly_visible"): EXPERIMENT_CONFIG,
    }

    @pytest.mark.parametrize(
        "entity_type,column_name",
        [(entity_type, column_name) for (entity_type, column_name) in COLUMN_CONFIGS],
    )
    def test_first_public_update_all_types(self, entity_type: EntityType, column_name: str) -> None:
        """
        Test that first_publicly_visible works for all entity types and columns:
        1. Put entity in status SUBMITTED with non-existing accessions
        2. Run check_and_update_visibility_for_column
        3. Check that visibility column is still None
        4. Update entity to existing accessions
        5. Run check_and_update_visibility_for_column again
        6. Check that visibility column is updated to current timestamp
        """
        config = COLUMN_CONFIGS[entity_type, column_name]

        # Get test data for this specific (entity_type, column_name) combination
        test_data_key = (entity_type, column_name)
        if test_data_key not in self.TEST_DATA:
            pytest.skip(f"No test data configured for {entity_type.value}.{column_name}")

        test_data = self.TEST_DATA[test_data_key]

        # Create entry with invalid accessions
        entry_data = {**test_data["base_entry"], "result": test_data["invalid_result"]}
        entry = config.entry_class(**entry_data)

        # Insert into the database
        added_entry = add_to_db(self.db_engine, entry)
        if added_entry is None:
            msg = f"Failed to add {entity_type.value} entry to the database."
            raise ValueError(msg)

        conditions = asdict(added_entry.pkey)

        # Run visibility check with invalid accessions
        check_and_update_visibility_for_column(
            self.config, self.db_engine, entity_type, column_name
        )

        # Check that visibility column is None
        rows = find_conditions_in_db(
            self.db_engine,
            config.entry_class,
            conditions=conditions,
        )
        logger.debug(f"Rows found after invalid check: {rows}")
        assert len(rows) == 1, f"{entity_type.value} not found in table."

        visibility_value = getattr(rows[0], column_name)
        assert visibility_value is None, (
            f"{column_name} should be None for non-existing accessions. Got: {visibility_value}"
        )

        # Update the entry to have valid accessions
        update_db_where_conditions(
            self.db_engine,
            config.entry_class,
            conditions=conditions,
            update_values={"result": test_data["valid_result"]},
        )

        # Run the visibility check again with valid accessions
        check_and_update_visibility_for_column(
            self.config, self.db_engine, entity_type, column_name
        )

        # Check that visibility column is now updated
        rows = find_conditions_in_db(
            self.db_engine,
            config.entry_class,
            conditions=conditions,
        )
        assert len(rows) == 1, f"{entity_type.value} not found in table after update."

        visibility_value = getattr(rows[0], column_name)
        assert visibility_value is not None, (
            f"{column_name} should be updated to current timestamp for valid accessions. "
            f"Got: {visibility_value}"
        )


class TestSimpleSubmission(TestSubmission):
    @patch(
        "ena_deposition.upload_external_metadata_to_loculus.submit_external_metadata", autospec=True
    )
    @patch("ena_deposition.call_loculus.get_group_info", autospec=True)
    def test_submit(self, mock_get_group_info: Mock, mock_submit_external_metadata: Mock) -> None:
        """
        Test the full ENA submission pipeline with accurate data - this should succeed
        """
        multi_segment_submission(
            self.db_engine,
            self.config,
            self.slack_config,
            mock_get_group_info,
            mock_submit_external_metadata,
        )


class TestSingleSegmentOfMultiSegmentOrganismWithoutGCA(TestSubmission):
    @patch(
        "ena_deposition.upload_external_metadata_to_loculus.submit_external_metadata", autospec=True
    )
    @patch("ena_deposition.call_loculus.get_group_info", autospec=True)
    def test_submit(self, mock_get_group_info: Mock, mock_submit_external_metadata: Mock) -> None:
        multi_segment_submission(
            self.db_engine,
            self.config,
            self.slack_config,
            mock_get_group_info,
            mock_submit_external_metadata,
            single_segment=True,
        )


class TestKnownBioproject(TestSubmission):
    @patch(
        "ena_deposition.upload_external_metadata_to_loculus.submit_external_metadata", autospec=True
    )
    @patch("ena_deposition.call_loculus.get_group_info", autospec=True)
    def test_submit(self, mock_get_group_info: Mock, mock_submit_external_metadata: Mock) -> None:
        """
        Test the full ENA submission pipeline with accurate data and a known bioproject
        """
        # get data
        mock_get_group_info.return_value = TEST_GROUP
        mock_submit_external_metadata.return_value = mock_requests_post()
        sequences_to_upload = get_sequences(config=self.config)
        for entry in sequences_to_upload.values():  # set to known public bioproject
            entry["metadata"][self.config.loculus_accession_fields.bioproject] = "PRJNA231221"

        # upload sequences
        upload_sequences(self.config, self.db_engine, sequences_to_upload)
        check_sequences_uploaded(self.db_engine, sequences_to_upload)

        # submit
        _test_successful_project_submission(self.db_engine, self.config, sequences_to_upload)
        _test_successful_sample_submission(self.db_engine, self.config, sequences_to_upload)
        _test_successful_assembly_submission(self.db_engine, self.config, sequences_to_upload)

        # send to loculus
        get_external_metadata_and_send_to_loculus(self.db_engine, self.config)
        check_sent_to_loculus(self.db_engine, sequences_to_upload)


class TestIncorrectBioprojectPassed(TestSubmission):
    @patch("ena_deposition.notifications.notify", autospec=True)
    @patch("ena_deposition.call_loculus.get_group_info", autospec=True)
    def test_submit(self, mock_get_group_info: Mock, mock_notify: Mock) -> None:
        """
        Test submitting sequences with an incorrect bioproject - this should fail
        """
        # get data
        mock_get_group_info.return_value = TEST_GROUP
        mock_notify.return_value = None
        sequences_to_upload = get_sequences(config=self.config)
        for entry in sequences_to_upload.values():  # set to invalid bioproject
            entry["metadata"][self.config.loculus_accession_fields.bioproject] = "INVALID_ACCESSION"

        # upload sequences
        upload_sequences(self.config, self.db_engine, sequences_to_upload)
        check_sequences_uploaded(self.db_engine, sequences_to_upload)

        # check project submission fails and sends notification
        create_project_sync_state_with_submission_table(self.db_engine, self.config)
        project_table_create(self.db_engine, self.config)
        check_project_submission_has_errors(self.db_engine, self.config, sequences_to_upload)
        project_table_handle_errors(
            self.db_engine,
            self.config,
            self.slack_config,
            last_retry_time=datetime.now(tz=pytz.utc),
        )
        msg = (
            f"{self.config.backend_url}: ENA Submission pipeline found 1 entries in project_table "
            "in status HAS_ERRORS or SUBMITTING for over 0m"
        )
        mock_notify.assert_called_once_with(self.slack_config, msg)

        project_table_handle_errors(
            self.db_engine,
            self.config,
            self.slack_config,
            last_retry_time=datetime.now(tz=pytz.utc) - timedelta(hours=5),
        )

        # Confirm DB entry is reset to READY to retry submission
        check_project_submission_started(self.db_engine, sequences_to_upload)

        # Confirm DB entry is still in error state after retrying submission
        create_project_sync_state_with_submission_table(self.db_engine, self.config)
        project_table_create(self.db_engine, self.config)
        check_project_submission_has_errors(self.db_engine, self.config, sequences_to_upload)

        # Confirm retries dont change state
        project_table_handle_errors(
            self.db_engine,
            self.config,
            self.slack_config,
            last_retry_time=datetime.now(tz=pytz.utc) - timedelta(hours=10),
        )
        check_project_submission_started(self.db_engine, sequences_to_upload)
        create_project_sync_state_with_submission_table(self.db_engine, self.config)
        project_table_create(self.db_engine, self.config)
        check_project_submission_has_errors(self.db_engine, self.config, sequences_to_upload)


class TestKnownBioprojectAndBioSample(TestSubmission):
    @patch(
        "ena_deposition.upload_external_metadata_to_loculus.submit_external_metadata", autospec=True
    )
    @patch("ena_deposition.call_loculus.get_group_info", autospec=True)
    def test_submit(self, mock_get_group_info: Mock, mock_submit_external_metadata: Mock) -> None:
        """
        Test submitting sequences with accurate data and known bioproject and biosample
        """
        # get data
        mock_get_group_info.return_value = TEST_GROUP
        mock_submit_external_metadata.return_value = mock_requests_post()
        sequences_to_upload = get_sequences(config=self.config)
        for entry in sequences_to_upload.values():  # set to public bioproject and biosample
            entry["metadata"][self.config.loculus_accession_fields.bioproject] = "PRJNA231221"
            entry["metadata"][self.config.loculus_accession_fields.biosample] = "SAMN11077987"

        # upload
        upload_sequences(self.config, self.db_engine, sequences_to_upload)
        check_sequences_uploaded(self.db_engine, sequences_to_upload)

        # submit
        _test_successful_project_submission(self.db_engine, self.config, sequences_to_upload)
        _test_successful_sample_submission(self.db_engine, self.config, sequences_to_upload)
        _test_successful_assembly_submission(self.db_engine, self.config, sequences_to_upload)

        # send to loculus
        get_external_metadata_and_send_to_loculus(self.db_engine, self.config)
        check_sent_to_loculus(self.db_engine, sequences_to_upload)

    @patch(
        "ena_deposition.upload_external_metadata_to_loculus.submit_external_metadata", autospec=True
    )
    @patch("ena_deposition.call_loculus.get_group_info", autospec=True)
    @patch("ena_deposition.create_project.accession_exists", autospec=True)
    @patch("ena_deposition.notifications.notify", autospec=True)
    def test_bioproject_retry(
        self,
        mock_notify: Mock,
        mock_accession_exists: Mock,
        mock_get_group_info: Mock,
        mock_submit_external_metadata: Mock,
    ) -> None:
        """
        Test submitting sequences with accurate data and known bioproject and biosample
        Force accession_exists test to fail on first attempt to simulate ENA
        not processing submission in time, then retrying and succeeding
        """
        # get data
        mock_get_group_info.return_value = TEST_GROUP
        mock_submit_external_metadata.return_value = mock_requests_post()
        mock_accession_exists.side_effect = chain([False], repeat(True))
        mock_notify.return_value = None

        sequences_to_upload = get_sequences(config=self.config)
        for entry in sequences_to_upload.values():  # set to public bioproject and biosample
            entry["metadata"][self.config.loculus_accession_fields.bioproject] = "PRJNA231221"
            entry["metadata"][self.config.loculus_accession_fields.biosample] = "SAMN11077987"

        # upload
        upload_sequences(self.config, self.db_engine, sequences_to_upload)
        check_sequences_uploaded(self.db_engine, sequences_to_upload)

        # check project submission fails
        create_project_sync_state_with_submission_table(self.db_engine, self.config)
        project_table_create(self.db_engine, self.config)
        check_project_submission_has_errors(self.db_engine, self.config, sequences_to_upload)

        # Confirm DB entry is reset to READY to retry submission
        project_table_handle_errors(
            self.db_engine,
            self.config,
            self.slack_config,
            last_retry_time=datetime.now(tz=pytz.utc) - timedelta(hours=5),
        )
        check_project_submission_started(self.db_engine, sequences_to_upload)

        # submit
        _test_successful_project_submission(self.db_engine, self.config, sequences_to_upload)
        _test_successful_sample_submission(self.db_engine, self.config, sequences_to_upload)
        _test_successful_assembly_submission(self.db_engine, self.config, sequences_to_upload)

        # send to loculus
        get_external_metadata_and_send_to_loculus(self.db_engine, self.config)
        check_sent_to_loculus(self.db_engine, sequences_to_upload)

    @patch(
        "ena_deposition.upload_external_metadata_to_loculus.submit_external_metadata", autospec=True
    )
    @patch("ena_deposition.call_loculus.get_group_info", autospec=True)
    @patch("ena_deposition.create_sample.accession_exists", autospec=True)
    @patch("ena_deposition.notifications.notify", autospec=True)
    def test_biosample_retry(
        self,
        mock_notify: Mock,
        mock_accession_exists: Mock,
        mock_get_group_info: Mock,
        mock_submit_external_metadata: Mock,
    ) -> None:
        """
        Test submitting sequences with accurate data and known bioproject and biosample
        Force accession_exists test to fail on first biosample query to simulate ENA
        not processing submission in time, then retrying and succeeding
        """
        # get data
        mock_get_group_info.return_value = TEST_GROUP
        mock_submit_external_metadata.return_value = mock_requests_post()
        mock_accession_exists.side_effect = chain([False], repeat(True))
        mock_notify.return_value = None

        sequences_to_upload = get_sequences(config=self.config)
        for entry in sequences_to_upload.values():  # set to public bioproject and biosample
            entry["metadata"][self.config.loculus_accession_fields.bioproject] = "PRJNA231221"
            entry["metadata"][self.config.loculus_accession_fields.biosample] = "SAMN11077987"

        # upload
        upload_sequences(self.config, self.db_engine, sequences_to_upload)
        check_sequences_uploaded(self.db_engine, sequences_to_upload)

        # submit
        _test_successful_project_submission(self.db_engine, self.config, sequences_to_upload)

        # check sample submission fails and sends notification
        create_sample_sync_state_with_submission_table(self.db_engine, self.config)
        sample_table_create(self.db_engine, self.config)
        check_sample_submission_has_errors(self.db_engine, self.config, sequences_to_upload)
        sample_table_handle_errors(
            self.db_engine,
            self.config,
            self.slack_config,
            last_retry_time=datetime.now(tz=pytz.utc) - timedelta(hours=5),
        )
        msg = (
            f"{self.config.backend_url}: ENA Submission pipeline found 1 entries in sample_table "
            "in status HAS_ERRORS or SUBMITTING for over 0m"
        )
        mock_notify.assert_called_once_with(self.slack_config, msg)

        # Confirm DB entry is reset to READY to retry submission
        check_sample_submission_started(self.db_engine, sequences_to_upload)
        create_sample_sync_state_with_submission_table(self.db_engine, self.config)
        sample_table_create(self.db_engine, self.config)
        create_sample_sync_state_with_submission_table(self.db_engine, self.config)
        check_sample_submission_submitted(self.db_engine, self.config, sequences_to_upload)
        _test_successful_assembly_submission(self.db_engine, self.config, sequences_to_upload)

        # send to loculus
        get_external_metadata_and_send_to_loculus(self.db_engine, self.config)
        check_sent_to_loculus(self.db_engine, sequences_to_upload)


class TestKnownBioprojectAndIncorrectBioSample(TestSubmission):
    @patch("ena_deposition.call_loculus.get_group_info", autospec=True)
    @patch("ena_deposition.notifications.notify", autospec=True)
    def test_submit(self, mock_notify: Mock, mock_get_group_info: Mock) -> None:
        """
        Test submitting sequences with known public bioproject and invalid biosample
        """
        # get data
        mock_get_group_info.return_value = TEST_GROUP
        mock_notify.return_value = None
        sequences_to_upload = get_sequences(config=self.config)
        for entry in sequences_to_upload.values():  # set to invalid biosample
            entry["metadata"][self.config.loculus_accession_fields.bioproject] = "PRJNA231221"
            entry["metadata"][self.config.loculus_accession_fields.biosample] = "INVALID_ACCESSION"

        # upload
        upload_sequences(self.config, self.db_engine, sequences_to_upload)
        check_sequences_uploaded(self.db_engine, sequences_to_upload)

        # submit project
        _test_successful_project_submission(self.db_engine, self.config, sequences_to_upload)

        # check sample submission fails and sends notification
        create_sample_sync_state_with_submission_table(self.db_engine, self.config)
        sample_table_create(self.db_engine, self.config)
        check_sample_submission_has_errors(self.db_engine, self.config, sequences_to_upload)
        sample_table_handle_errors(
            self.db_engine,
            self.config,
            self.slack_config,
            last_retry_time=datetime.now(tz=pytz.utc) - timedelta(hours=5),
        )
        msg = (
            f"{self.config.backend_url}: ENA Submission pipeline found 1 entries in sample_table "
            "in status HAS_ERRORS or SUBMITTING for over 0m"
        )
        mock_notify.assert_called_once_with(self.slack_config, msg)

        # Confirm DB entry is reset to READY to retry submission
        check_sample_submission_started(self.db_engine, sequences_to_upload)
        create_sample_sync_state_with_submission_table(self.db_engine, self.config)
        sample_table_create(self.db_engine, self.config)
        check_sample_submission_has_errors(self.db_engine, self.config, sequences_to_upload)

        # Confirm retries dont change state
        sample_table_handle_errors(
            self.db_engine,
            self.config,
            self.slack_config,
            last_retry_time=datetime.now(tz=pytz.utc) - timedelta(hours=10),
        )
        check_sample_submission_started(self.db_engine, sequences_to_upload)
        create_project_sync_state_with_submission_table(self.db_engine, self.config)
        sample_table_create(self.db_engine, self.config)
        check_sample_submission_has_errors(self.db_engine, self.config, sequences_to_upload)


class TestRevisionAssemblyModificationTests(TestSubmission):
    @pytest.mark.parametrize(
        ("modify_assembly", "modify_manifest"),
        [
            pytest.param(True, False, id="assembly_field_changed"),
            pytest.param(False, True, id="manifest_only_changed"),
        ],
    )
    @patch(
        "ena_deposition.upload_external_metadata_to_loculus.submit_external_metadata", autospec=True
    )
    @patch("ena_deposition.call_loculus.get_group_info", autospec=True)
    def test_revise(
        self,
        mock_get_group_info: Mock,
        mock_submit_external_metadata: Mock,
        modify_assembly: bool,
        modify_manifest: bool,
    ) -> None:
        self.config.set_alias_suffix = "revision" + str(uuid.uuid4())
        self.config.allow_revision_with_manifest_changes = True
        multi_segment_submission(
            self.db_engine,
            self.config,
            self.slack_config,
            mock_get_group_info,
            mock_submit_external_metadata,
        )

        # get data
        mock_get_group_info.return_value = TEST_GROUP
        mock_submit_external_metadata.return_value = mock_requests_post()
        sequences_to_upload = get_revisions(
            config=self.config,
            modify_assembly=modify_assembly,
            modify_assembly_manifest=modify_manifest,
        )

        # upload sequences
        upload_sequences(self.config, self.db_engine, sequences_to_upload)
        check_sequences_uploaded(self.db_engine, sequences_to_upload)

        # submit
        create_project_sync_state_with_submission_table(self.db_engine, self.config)
        project_table_create(self.db_engine, self.config)
        check_project_submission_submitted(self.db_engine, self.config, sequences_to_upload)
        _test_successful_sample_submission(self.db_engine, self.config, sequences_to_upload)
        _test_successful_assembly_submission(self.db_engine, self.config, sequences_to_upload)

        # send to loculus
        get_external_metadata_and_send_to_loculus(self.db_engine, self.config)
        check_sent_to_loculus(self.db_engine, sequences_to_upload)


class TestRevisionNoAssemblyModificationTests(TestSubmission):
    @patch(
        "ena_deposition.upload_external_metadata_to_loculus.submit_external_metadata", autospec=True
    )
    @patch("ena_deposition.call_loculus.get_group_info", autospec=True)
    def test_revise(self, mock_get_group_info: Mock, mock_submit_external_metadata: Mock) -> None:
        self.config.set_alias_suffix = "revision" + str(uuid.uuid4())
        multi_segment_submission(
            self.db_engine,
            self.config,
            self.slack_config,
            mock_get_group_info,
            mock_submit_external_metadata,
        )

        # get data
        mock_get_group_info.return_value = TEST_GROUP
        mock_submit_external_metadata.return_value = mock_requests_post()
        sequences_to_upload = get_revisions(config=self.config, modify_assembly=False)

        # upload sequences
        upload_sequences(self.config, self.db_engine, sequences_to_upload)
        check_sequences_uploaded(self.db_engine, sequences_to_upload)

        # submit
        create_project_sync_state_with_submission_table(self.db_engine, self.config)
        project_table_create(self.db_engine, self.config)
        check_project_submission_submitted(self.db_engine, self.config, sequences_to_upload)
        _test_successful_sample_submission(self.db_engine, self.config, sequences_to_upload)
        _test_successful_assembly_submission_no_wait(
            self.db_engine, self.config, sequences_to_upload
        )

        # send to loculus
        get_external_metadata_and_send_to_loculus(self.db_engine, self.config)
        check_sent_to_loculus(self.db_engine, sequences_to_upload)


class TestRevisionWithAssemblyManifestChangeTests(TestSubmission):
    @patch(
        "ena_deposition.upload_external_metadata_to_loculus.submit_external_metadata", autospec=True
    )
    @patch("ena_deposition.call_loculus.get_group_info", autospec=True)
    @patch("ena_deposition.notifications.notify", autospec=True)
    def test_revise(
        self,
        mock_notify: Mock,
        mock_get_group_info: Mock,
        mock_submit_external_metadata: Mock,
    ) -> None:
        self.config.set_alias_suffix = "revision" + str(uuid.uuid4())
        self.config.allow_revision_with_manifest_changes = False
        multi_segment_submission(
            self.db_engine,
            self.config,
            self.slack_config,
            mock_get_group_info,
            mock_submit_external_metadata,
        )
        # get data
        mock_get_group_info.return_value = TEST_GROUP
        mock_submit_external_metadata.return_value = mock_requests_post()
        sequences_to_upload = get_revisions(config=self.config, modify_assembly_manifest=True)

        # upload sequences
        upload_sequences(self.config, self.db_engine, sequences_to_upload)
        check_sequences_uploaded(self.db_engine, sequences_to_upload)

        # submit
        create_project_sync_state_with_submission_table(self.db_engine, self.config)
        check_project_submission_submitted(self.db_engine, self.config, sequences_to_upload)
        _test_successful_sample_submission(self.db_engine, self.config, sequences_to_upload)

        # check notified cannot submit assembly
        _test_assembly_submission_errored(
            self.db_engine, self.config, self.slack_config, sequences_to_upload, mock_notify
        )


class TestInsdcRawReadsAccessionInManifest(TestSubmission):
    @patch("ena_deposition.ena_submission_helper.post_webin_with_retry", autospec=True)
    @patch("ena_deposition.create_assembly.create_ena_assembly", autospec=True)
    @patch("ena_deposition.call_loculus.get_group_info", autospec=True)
    def test_run_ref_written_to_manifest(
        self,
        mock_get_group_info: Mock,
        mock_create_ena_assembly: Mock,
        mock_post_webin_with_retry: Mock,
    ) -> None:
        """When ``insdcRawReadsAccession`` is present in the metadata it must be sent to ENA
        as the ``RUN_REF`` field of the assembly manifest.tsv.

        No data is submitted to ENA as known public bioproject, biosample
        (and insdcRawReadsAccession) accessions are supplied, so no new project/sample is created.

        The test captures the manifest.tsv file that would be sent to ENA and checks that the
        correct RUN_REF is present.
        """
        run_ref_accession = "ERR17356121"
        bioproject_accession = "PRJNA231221"
        biosample_accession = "SAMN11077987"

        mock_get_group_info.return_value = TEST_GROUP

        captured_manifests: list[str] = []

        def spy_create_ena_assembly(
            config: Config,  # noqa: ARG001
            manifest_filename: str,
            center_name: str | None = None,  # noqa: ARG001
        ) -> CreationResult:
            captured_manifests.append(Path(manifest_filename).read_text(encoding="utf-8"))
            return CreationResult(errors=[], warnings=[], result={"erz_accession": "ERZ_TEST"})

        mock_create_ena_assembly.side_effect = spy_create_ena_assembly

        sequences_to_upload = get_sequences(config=self.config)
        for entry in sequences_to_upload.values():
            # known public accessions
            entry["metadata"][self.config.loculus_accession_fields.bioproject] = (
                bioproject_accession
            )
            entry["metadata"][self.config.loculus_accession_fields.biosample] = biosample_accession
            entry["metadata"][self.config.loculus_accession_fields.run] = run_ref_accession

        upload_sequences(self.config, self.db_engine, sequences_to_upload)
        check_sequences_uploaded(self.db_engine, sequences_to_upload)

        _test_successful_project_submission(self.db_engine, self.config, sequences_to_upload)
        _test_successful_sample_submission(self.db_engine, self.config, sequences_to_upload)
        _test_successful_raw_reads_submission(
            self.db_engine, self.config, sequences_to_upload, self.slack_config
        )

        mock_post_webin_with_retry.assert_not_called()

        create_assembly_submission_table_start(self.db_engine)
        check_assembly_submission_started(self.db_engine, sequences_to_upload)
        assembly_table_create(self.db_engine, self.config)
        check_assembly_submission_waiting(self.db_engine, sequences_to_upload)

        assert mock_create_ena_assembly.called, "create_ena_assembly (webin-cli) was never called"
        assert len(captured_manifests) == len(sequences_to_upload), (
            f"Expected one manifest.tsv per sequence, got {len(captured_manifests)}"
        )
        for manifest_contents in captured_manifests:
            for expected_line in (
                f"RUN_REF\t{run_ref_accession}",
                f"STUDY\t{bioproject_accession}",
                f"SAMPLE\t{biosample_accession}",
            ):
                assert expected_line in manifest_contents, (
                    f"'{expected_line}' missing from the manifest.tsv sent to ENA:"
                    f"\n{manifest_contents}"
                )


class TestSimpleSubmissionWithRawReads(TestSubmission):
    @patch(
        "ena_deposition.upload_external_metadata_to_loculus.submit_external_metadata", autospec=True
    )
    @patch("ena_deposition.call_loculus.get_group_info", autospec=True)
    @patch("ena_deposition.call_loculus.requests.get", autospec=True)
    def test_submit(
        self,
        mock_requests_get: Mock,
        mock_get_group_info: Mock,
        mock_submit_external_metadata: Mock,
    ) -> None:
        """
        Test the full ENA submission pipeline with accurate data - this should succeed
        """
        multi_segment_submission(
            self.db_engine,
            self.config,
            self.slack_config,
            mock_get_group_info,
            mock_submit_external_metadata,
            with_raw_reads=True,
            mock_requests_get=mock_requests_get,
        )


class TestRevisionRawReadsOnlyModificationTests(TestSubmission):
    @patch(
        "ena_deposition.upload_external_metadata_to_loculus.submit_external_metadata", autospec=True
    )
    @patch("ena_deposition.call_loculus.get_group_info", autospec=True)
    @patch("ena_deposition.call_loculus.download_fastq_files", autospec=True)
    @patch("ena_deposition.create_raw_reads.notify", autospec=True)
    @patch("ena_deposition.create_assembly.create_manifest", autospec=True)
    def test_revise(
        self,
        mock_create_manifest: Mock,
        mock_notify: Mock,  # noqa: ARG002 - used in _test_successful_raw_reads_submission
        mock_download_fastq_files: Mock,
        mock_get_group_info: Mock,
        mock_submit_external_metadata: Mock,
    ) -> None:
        """
        Revising only the raw reads (consensus sequence and assembly metadata unchanged) creates
        a new run accession. The assembly must then be resubmitted with a manifest that links to
        the new run instead of reusing the previous assembly result (which links to the old run).
        """
        mock_create_manifest.side_effect = create_manifest
        self.config.set_alias_suffix = "revision" + str(uuid.uuid4())
        multi_segment_submission(
            self.db_engine,
            self.config,
            self.slack_config,
            mock_get_group_info,
            mock_submit_external_metadata,
            with_raw_reads=True,
            mock_download_fastq_files=mock_download_fastq_files,
        )
        first_manifest = mock_create_manifest.call_args[0][0]
        old_run_ref = get_run_ref_from_raw_reads_table(self.db_engine, TEST_ACCESSION, 1)
        assert old_run_ref is not None and old_run_ref.startswith("ERR")
        assert first_manifest.run_ref == old_run_ref

        # get data
        mock_get_group_info.return_value = TEST_GROUP
        mock_submit_external_metadata.return_value = mock_requests_post()
        sequences_to_upload = get_revisions(
            config=self.config,
            modify_raw_reads=True,
            modify_assembly=False,
            with_raw_reads=True,
        )

        # upload sequences
        upload_sequences(self.config, self.db_engine, sequences_to_upload)
        check_sequences_uploaded(self.db_engine, sequences_to_upload, with_raw_reads=True)

        # submit
        create_project_sync_state_with_submission_table(self.db_engine, self.config)
        project_table_create(self.db_engine, self.config)
        check_project_submission_submitted(self.db_engine, self.config, sequences_to_upload)
        _test_successful_sample_submission(self.db_engine, self.config, sequences_to_upload)
        _test_successful_raw_reads_submission(
            self.db_engine, self.config, sequences_to_upload, self.slack_config
        )
        new_run_ref = get_run_ref_from_raw_reads_table(self.db_engine, TEST_ACCESSION, 2)
        assert new_run_ref is not None and new_run_ref.startswith("ERR")
        assert new_run_ref != old_run_ref

        # The assembly must be resubmitted (WAITING with a new erz_accession), not copied from v1
        mock_create_manifest.reset_mock()
        _test_successful_assembly_submission(self.db_engine, self.config, sequences_to_upload)
        mock_create_manifest.assert_called_once()
        revised_manifest = mock_create_manifest.call_args[0][0]
        assert revised_manifest.run_ref == new_run_ref

        # send to loculus
        get_external_metadata_and_send_to_loculus(self.db_engine, self.config)
        check_sent_to_loculus(self.db_engine, sequences_to_upload)


class TestRevisionRawReadsModificationTests(TestSubmission):
    @pytest.mark.parametrize(
        "set_insert_size",
        [
            pytest.param(True, id="with_insert_size"),
            pytest.param(False, id="without_insert_size"),
        ],
    )
    @patch(
        "ena_deposition.upload_external_metadata_to_loculus.submit_external_metadata", autospec=True
    )
    @patch("ena_deposition.call_loculus.get_group_info", autospec=True)
    @patch("ena_deposition.call_loculus.requests.get")
    @patch("ena_deposition.create_raw_reads.notify", autospec=True)
    def test_revise(
        self,
        mock_notify: Mock,  # noqa: ARG002 - used in _test_successful_raw_reads_submission
        mock_requests_get: Mock,
        mock_get_group_info: Mock,
        mock_submit_external_metadata: Mock,
        set_insert_size: bool,
    ) -> None:
        """
        Paired (2-file) raw reads must submit successfully both with and without an
        insert size provided in the metadata.
        """
        self.config.set_alias_suffix = "revision" + str(uuid.uuid4())
        original_accessions = multi_segment_submission(
            self.db_engine,
            self.config,
            self.slack_config,
            mock_get_group_info,
            mock_submit_external_metadata,
            with_raw_reads=True,
            mock_requests_get=mock_requests_get,
        )

        # get data
        mock_get_group_info.return_value = TEST_GROUP
        mock_submit_external_metadata.return_value = mock_requests_post()
        sequences_to_upload = get_revisions(
            config=self.config,
            modify_raw_reads=True,
            with_raw_reads=True,
            set_insert_size=set_insert_size,
        )

        # upload sequences
        upload_sequences(self.config, self.db_engine, sequences_to_upload)
        check_sequences_uploaded(self.db_engine, sequences_to_upload, with_raw_reads=True)

        # submit
        create_project_sync_state_with_submission_table(self.db_engine, self.config)
        project_table_create(self.db_engine, self.config)
        check_project_submission_submitted(self.db_engine, self.config, sequences_to_upload)
        _test_successful_sample_submission(self.db_engine, self.config, sequences_to_upload)
        _test_successful_raw_reads_submission(
            self.db_engine, self.config, sequences_to_upload, self.slack_config
        )
        _test_successful_assembly_submission(self.db_engine, self.config, sequences_to_upload)

        # send to loculus
        get_external_metadata_and_send_to_loculus(self.db_engine, self.config)

        run_field = self.config.loculus_accession_fields.run
        revised_run = last_external_metadata_accessions(mock_submit_external_metadata)[run_field]
        assert original_accessions[run_field] != revised_run, (
            "When raw reads are modified, insdcRawReadsAccession should change"
        )
        check_sent_to_loculus(self.db_engine, sequences_to_upload)


class TestRevisionNoRawReadsNoAssemblyModificationTests(TestSubmission):
    @patch(
        "ena_deposition.upload_external_metadata_to_loculus.submit_external_metadata", autospec=True
    )
    @patch("ena_deposition.call_loculus.get_group_info", autospec=True)
    @patch("ena_deposition.call_loculus.requests.get")
    def test_revise(
        self,
        mock_requests_get: Mock,
        mock_get_group_info: Mock,
        mock_submit_external_metadata: Mock,
    ) -> None:
        self.config.set_alias_suffix = "revision" + str(uuid.uuid4())
        original_accessions = multi_segment_submission(
            self.db_engine,
            self.config,
            self.slack_config,
            mock_get_group_info,
            mock_submit_external_metadata,
            with_raw_reads=True,
            mock_requests_get=mock_requests_get,
        )

        # get data
        mock_get_group_info.return_value = TEST_GROUP
        mock_submit_external_metadata.return_value = mock_requests_post()
        sequences_to_upload = get_revisions(
            config=self.config, modify_assembly=False, modify_raw_reads=False, with_raw_reads=True
        )

        # upload sequences
        upload_sequences(self.config, self.db_engine, sequences_to_upload)
        check_sequences_uploaded(self.db_engine, sequences_to_upload, with_raw_reads=True)

        # submit
        create_project_sync_state_with_submission_table(self.db_engine, self.config)
        project_table_create(self.db_engine, self.config)
        check_project_submission_submitted(self.db_engine, self.config, sequences_to_upload)
        _test_successful_sample_submission(self.db_engine, self.config, sequences_to_upload)
        _test_successful_raw_reads_submission(
            self.db_engine, self.config, sequences_to_upload, self.slack_config
        )
        _test_successful_assembly_submission_no_wait(
            self.db_engine, self.config, sequences_to_upload
        )

        # send to loculus
        get_external_metadata_and_send_to_loculus(self.db_engine, self.config)

        run_field = self.config.loculus_accession_fields.run
        revised_run = last_external_metadata_accessions(mock_submit_external_metadata)[run_field]
        assert original_accessions[run_field] == revised_run, (
            "When raw reads are not modified, insdcRawReadsAccession should stay the same"
        )
        check_sent_to_loculus(self.db_engine, sequences_to_upload)


class TestRevisionWithNotAllowedRawReadsManifestChangeTest(TestSubmission):
    @patch(
        "ena_deposition.upload_external_metadata_to_loculus.submit_external_metadata", autospec=True
    )
    @patch("ena_deposition.call_loculus.get_group_info", autospec=True)
    @patch("ena_deposition.notifications.notify", autospec=True)
    @patch("ena_deposition.call_loculus.requests.get")
    def test_revise(
        self,
        mock_requests_get: Mock,
        mock_notify: Mock,
        mock_get_group_info: Mock,
        mock_submit_external_metadata: Mock,
    ) -> None:
        self.config.set_alias_suffix = "revision" + str(uuid.uuid4())
        self.config.allow_revision_with_manifest_changes = False
        multi_segment_submission(
            self.db_engine,
            self.config,
            self.slack_config,
            mock_get_group_info,
            mock_submit_external_metadata,
            with_raw_reads=True,
            mock_requests_get=mock_requests_get,
        )
        # get data
        mock_get_group_info.return_value = TEST_GROUP
        mock_submit_external_metadata.return_value = mock_requests_post()
        sequences_to_upload = get_revisions(
            config=self.config, modify_raw_reads_manifest=True, with_raw_reads=True
        )

        # upload sequences
        upload_sequences(self.config, self.db_engine, sequences_to_upload)
        check_sequences_uploaded(self.db_engine, sequences_to_upload, with_raw_reads=True)

        # submit
        create_project_sync_state_with_submission_table(self.db_engine, self.config)
        check_project_submission_submitted(self.db_engine, self.config, sequences_to_upload)
        _test_successful_sample_submission(self.db_engine, self.config, sequences_to_upload)

        # check notified cannot submit raw reads
        _test_raw_reads_submission_errored(
            self.db_engine, self.config, self.slack_config, sequences_to_upload, mock_notify
        )


# TODO(6877): add support for revision with raw reads manifest changes
# class TestRevisionWithRawReadsManifestChangeTests(TestSubmission):
#     @patch(
#         "ena_deposition.upload_external_metadata_to_loculus.submit_external_metadata",
#         autospec=True,
#     )
#     @patch("ena_deposition.call_loculus.get_group_info", autospec=True)
#     @patch("ena_deposition.call_loculus.requests.get")
#     def test_revise(
#         self,
#         mock_requests_get: Mock,
#         mock_get_group_info: Mock,
#         mock_submit_external_metadata: Mock,
#     ) -> None:
#         self.config.set_alias_suffix = "revision" + str(uuid.uuid4())
#         original_accessions = multi_segment_submission(
#             self.db_engine,
#             self.config,
#             self.slack_config,
#             mock_get_group_info,
#             mock_submit_external_metadata,
#             with_raw_reads=True,
#             mock_requests_get=mock_requests_get,
#         )
#         # get data
#         mock_get_group_info.return_value = TEST_GROUP
#         mock_submit_external_metadata.return_value = mock_requests_post()
#         sequences_to_upload = get_revisions(
#             config=self.config, modify_raw_reads_manifest=True, with_raw_reads=True)

#         # upload sequences
#         upload_sequences(self.config, self.db_engine, sequences_to_upload)
#         check_sequences_uploaded(self.db_engine, sequences_to_upload, with_raw_reads=True)

#         # submit
#         create_project_sync_state_with_submission_table(self.db_engine)
#         check_project_submission_submitted(self.db_engine, sequences_to_upload)
#         _test_successful_sample_submission(self.db_engine, self.config, sequences_to_upload)
#         _test_successful_raw_reads_submission(
#             self.db_engine, self.config, sequences_to_upload, self.slack_config
#         )
#         _test_successful_assembly_submission(self.db_engine, self.config, sequences_to_upload)

#         # send to loculus
#         get_external_metadata_and_send_to_loculus(self.db_engine, self.config)

#         run_field = config.loculus_accession_fields.run
#         revised_run = last_external_metadata_accessions(mock_submit_external_metadata)[run_field]
#         assert original_accessions[run_field] == revised_run, (
#             "When raw reads are not modified, insdcRawReadsAccession should stay the same"
#         )
#         check_sent_to_loculus(self.db_engine, sequences_to_upload)


if __name__ == "__main__":
    import pytest

    pytest.main([__file__])
