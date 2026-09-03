import json
import logging
from datetime import datetime, timedelta
from typing import Any
from unittest.mock import Mock

import pytz
from ena_deposition.config import (
    Config,
    get_config,
)
from ena_deposition.create_assembly import (
    assembly_table_create,
    assembly_table_handle_errors,
    assembly_table_update,
    create_assembly_iter,
)
from ena_deposition.create_assembly import (
    submission_table_start as create_assembly_submission_table_start,
)
from ena_deposition.create_assembly import (
    submission_table_update as create_assembly_submission_table_update,
)
from ena_deposition.create_project import create_project_iter
from ena_deposition.create_sample import create_sample_iter
from ena_deposition.notifications import SlackConfig
from ena_deposition.submission_db_helper import (
    AssemblyTableEntry,
    ProjectTableEntry,
    SampleTableEntry,
    StatusAll,
    SubmissionTableEntry,
    db_init,
    delete_records_in_db,
    find_conditions_in_db,
    in_submission_table,
    update_db_where_conditions,
)
from sqlalchemy import Engine

CONFIG_FILE = "./test/test_config.yaml"
INPUT_FILE = "./test/data/approved_ena_submission_list_test.json"

# ruff: noqa: S101 (allow asserts in tests))

logger = logging.getLogger(__name__)


class SubmissionTestBase:
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


################################################################################
# Functions for generating test data
################################################################################


def get_sequences() -> dict[str, Any]:
    with open(INPUT_FILE, encoding="utf-8") as json_file:
        sequences: dict[str, Any] = json.load(json_file)
        return sequences


def get_revisions(modify_manifest: bool = False, modify_assembly: bool = True) -> dict[str, Any]:
    with open(INPUT_FILE, encoding="utf-8") as json_file:
        sequences: dict[str, Any] = json.load(json_file)
        revised_sequences: dict[str, Any] = {}
        for value in sequences.values():
            new_value = value.copy()
            accession: str = new_value["metadata"]["accession"]
            accession_version = accession + ".2"
            new_value["metadata"]["version"] = 2
            new_value["metadata"]["accessionVersion"] = accession_version
            if modify_assembly:
                new_value["metadata"]["geoLocAdmin1"] = "revised location"
            else:
                new_value["metadata"]["hostAge"] = "revised host age"
            if modify_manifest:
                new_value["metadata"]["sequencingInstrument"] = "Helicos HeliScope"
            revised_sequences[accession_version] = new_value
        return revised_sequences


################################################################################
# Functions for testing the database state after running the submission pipeline
################################################################################


def assert_biosample_accession(
    rows: list[SampleTableEntry], biosample_accession: str, full_accession: str
) -> None:
    assert len(rows) == 1, f"Sample for {full_accession} not found in sample table."
    if biosample_accession:
        assert rows[0].result, f"No result for sample {full_accession} in sample table."
        assert rows[0].result.get("biosample_accession") == biosample_accession, (
            "Incorrect biosample accession in sample table."
        )


def assert_bioproject_accession(
    rows: list[ProjectTableEntry], bioproject_accession: str, group_id: str, full_accession: str
) -> None:
    assert len(rows) == 1, f"Project {group_id} for {full_accession} not found in project table."
    if bioproject_accession:
        assert rows[0].result, f"No result for project {group_id} in project table."
        assert rows[0].result.get("bioproject_accession") == bioproject_accession, (
            "Incorrect bioproject accession in project table."
        )


def delete_all_records(db_engine: Engine) -> None:
    logger.debug("Deleting all records from all deposition tables except flyway")
    for model_class in [
        SubmissionTableEntry,
        ProjectTableEntry,
        SampleTableEntry,
        AssemblyTableEntry,
    ]:
        delete_records_in_db(db_engine, model_class, {})


def check_sequences_uploaded(db_engine: Engine, sequences_to_upload: dict[str, Any]) -> None:
    for full_accession in sequences_to_upload:
        accession, version = full_accession.split(".")
        assert in_submission_table(
            db_engine, {"accession": accession, "version": version, "status_all": "READY_TO_SUBMIT"}
        ), f"Sequence {accession}.{version} not found in submission table."


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


def check_sample_submission_submitted(
    db_engine: Engine, sequences_to_upload: dict[str, Any]
) -> None:
    for full_accession, data in sequences_to_upload.items():
        accession, version = full_accession.split(".")
        rows = find_conditions_in_db(
            db_engine,
            SampleTableEntry,
            conditions={"accession": accession, "version": version, "status": "SUBMITTED"},
        )
        assert_biosample_accession(rows, data["metadata"]["biosampleAccession"], full_accession)
        assert in_submission_table(
            db_engine,
            {"accession": accession, "version": version, "status_all": StatusAll.SUBMITTED_SAMPLE},
        ), f"Sequence {accession}.{version} not in state SUBMITTED_SAMPLE submission table."


def check_sample_submission_has_errors(
    db_engine: Engine, sequences_to_upload: dict[str, Any]
) -> None:
    for full_accession, data in sequences_to_upload.items():
        accession, version = full_accession.split(".")
        rows = find_conditions_in_db(
            db_engine,
            SampleTableEntry,
            conditions={"accession": accession, "version": version, "status": "HAS_ERRORS"},
        )
        assert_biosample_accession(rows, data["metadata"]["biosampleAccession"], full_accession)


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
        assert rows[0].result.get("insdc_accession_full_L") is not None
        assert rows[0].result.get("insdc_accession_full_M") is None
        assert rows[0].result.get("gca_accession") is None


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
    db_engine: Engine, sequences_to_upload: dict[str, Any]
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
            rows, data["metadata"]["bioprojectAccession"], group_id, full_accession
        )
        assert in_submission_table(
            db_engine,
            {"accession": accession, "version": version, "status_all": StatusAll.SUBMITTED_PROJECT},
        ), f"Sequence {accession}.{version} not in state SUBMITTED_PROJECT submission table."


def check_project_submission_has_errors(
    db_engine: Engine, sequences_to_upload: dict[str, Any]
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
            rows, data["metadata"]["bioprojectAccession"], group_id, full_accession
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


def assert_successful_assembly_submission(
    db_engine: Engine,
    config: Config,
    sequences_to_upload: dict[str, Any],
    single_segment: bool = False,
) -> None:
    create_assembly_submission_table_start(db_engine, config)
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


def assert_successful_assembly_submission_no_wait(
    db_engine: Engine,
    config: Config,
    slack_config: SlackConfig,
    sequences_to_upload: dict[str, Any],
) -> None:
    assert config.test, "Not submitting to dev - stopping"
    create_assembly_iter(db_engine, config, slack_config, last_retry_time=None)
    check_assembly_submission_submitted(db_engine, sequences_to_upload)


def assert_assembly_submission_errored(
    db_engine: Engine,
    config: Config,
    slack_config: SlackConfig,
    sequences_to_upload: dict[str, Any],
    mock_notify: Mock,
) -> None:
    assert config.test, "Not submitting to dev - stopping"
    create_assembly_submission_table_start(db_engine, config)
    check_assembly_submission_started(db_engine, sequences_to_upload)

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


def assert_successful_sample_submission(
    db_engine: Engine,
    config: Config,
    slack_config: SlackConfig,
    sequences_to_upload: dict[str, Any],
) -> None:
    create_sample_iter(db_engine, config, slack_config, last_retry_time=None)
    check_sample_submission_submitted(db_engine, sequences_to_upload)


def assert_successful_project_submission(
    db_engine: Engine,
    config: Config,
    slack_config: SlackConfig,
    sequences_to_upload: dict[str, Any],
) -> None:
    create_project_iter(db_engine, config, slack_config, last_retry_time=None)
    check_project_submission_submitted(db_engine, sequences_to_upload)
