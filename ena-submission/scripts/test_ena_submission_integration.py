# run
# docker run --name test-postgres -e POSTGRES_USER=postgres -e POSTGRES_PASSWORD=unsecure -e POSTGRES_DB=loculus -p 5432:5432 -d postgres
import json
import subprocess
import unittest
from datetime import datetime, timedelta
from typing import Any
from unittest.mock import patch

import pytz
from ena_deposition.config import Config, get_config
from ena_deposition.create_project import (
    project_table_handle_errors,
)
from ena_deposition.create_project import (
    submission_table_start as create_project_submission_table_start,
)
from ena_deposition.create_sample import (
    sample_table_handle_errors,
)
from ena_deposition.create_sample import (
    submission_table_start as create_sample_submission_table_start,
)
from ena_deposition.notifications import SlackConfig
from ena_deposition.submission_db_helper import (
    StatusAll,
    db_init,
    delete_records_in_db,
    find_conditions_in_db,
    in_submission_table,
)
from ena_deposition.trigger_submission_to_ena import upload_sequences
from psycopg2.pool import SimpleConnectionPool

config_file = "./test/test_config.yaml"
input_file = "./test/approved_ena_submission_list_test.json"


def run_flyway():
    """Runs Flyway migrations on test database."""
    subprocess.run(
        [  # noqa: S607
            "flyway",
            "-url=jdbc:postgresql://localhost:5432/loculus",
            "-schemas=ena_deposition_schema",
            "-user=postgres",
            "-password=unsecure",
            "-locations=filesystem:./flyway/sql",
            "migrate",
        ],
        check=True,
    )


def delete_all_records(db_config: SimpleConnectionPool):
    for table_name in ["submission_table", "project_table", "sample_table", "assembly_table"]:
        delete_records_in_db(db_config, table_name, {})


def setup_test_db():
    """Runs Flyway migrations before the test session starts."""
    run_flyway()
    yield


def check_sequences_uploaded(db_config: SimpleConnectionPool, sequences_to_upload: dict[str, Any]):
    for full_accession in sequences_to_upload:
        accession, version = full_accession.split(".")
        assert in_submission_table(
            db_config, {"accession": accession, "version": version, "status_all": "READY_TO_SUBMIT"}
        ), f"Sequence {accession}.{version} not found in submission table."


def check_project_submission_started(
    db_config: SimpleConnectionPool, sequences_to_upload: dict[str, Any]
):
    for full_accession, data in sequences_to_upload.items():
        group_id = data["metadata"]["groupId"]
        organism = data["organism"]
        assert (
            len(
                find_conditions_in_db(
                    db_config,
                    "project_table",
                    conditions={"group_id": group_id, "organism": organism, "status": "READY"},
                )
            )
            == 1
        ), f"Project {group_id} for {full_accession} not found in project table."


def check_sample_submission_started(
    db_config: SimpleConnectionPool, sequences_to_upload: dict[str, Any]
):
    for full_accession in sequences_to_upload:
        accession, version = full_accession.split(".")
        assert (
            len(
                find_conditions_in_db(
                    db_config,
                    "sample_table",
                    conditions={"accession": accession, "version": version, "status": "READY"},
                )
            )
            == 1
        ), f"Sample for {full_accession} not found in sample table."


def check_sample_submission_submitted(
    db_config: SimpleConnectionPool, sequences_to_upload: dict[str, Any]
):
    for full_accession, data in sequences_to_upload.items():
        accession, version = full_accession.split(".")
        rows = find_conditions_in_db(
            db_config,
            "sample_table",
            conditions={"accession": accession, "version": version, "status": "SUBMITTED"},
        )
        assert len(rows) == 1, f"Sample for {full_accession} not found in sample table."
        biosample = data["metadata"]["biosampleAccession"]
        if biosample:
            assert (
                len([row["result"].get("ena_sample_accession") == biosample for row in rows]) == 1
            ), "Incorrect biosample accession in sample table."
        rows = find_conditions_in_db(
            db_config,
            "submission_table",
            conditions={"accession": accession, "version": version},
        )
        assert in_submission_table(
            db_config,
            {"accession": accession, "version": version, "status_all": StatusAll.SUBMITTED_SAMPLE},
        ), f"Sequence {accession}.{version} not in state SUBMITTED_SAMPLE submission table."


def check_sample_submission_has_errors(
    db_config: SimpleConnectionPool, sequences_to_upload: dict[str, Any]
):
    for full_accession, data in sequences_to_upload.items():
        accession, version = full_accession.split(".")
        rows = find_conditions_in_db(
            db_config,
            "sample_table",
            conditions={"accession": accession, "version": version, "status": "HAS_ERRORS"},
        )
        assert len(rows) == 1, f"Sample for {full_accession} not found in sample table."
        biosample = data["metadata"]["biosampleAccession"]
        if biosample:
            assert (
                len([row["result"].get("ena_sample_accession") == biosample for row in rows]) == 1
            ), "Incorrect biosample accession in sample table."


def check_project_submission_submitted(
    db_config: SimpleConnectionPool, sequences_to_upload: dict[str, Any]
):
    for full_accession, data in sequences_to_upload.items():
        accession, version = full_accession.split(".")
        group_id = data["metadata"]["groupId"]
        organism = data["organism"]
        rows = find_conditions_in_db(
            db_config,
            "project_table",
            conditions={"group_id": group_id, "organism": organism, "status": "SUBMITTED"},
        )
        assert len(rows) == 1, (
            f"Project {group_id} for {full_accession} not found in project table."
        )
        bioproject = data["metadata"]["bioprojectAccession"]
        if bioproject:
            assert (
                len([row["result"].get("bioproject_accession") == bioproject for row in rows]) == 1
            ), "Incorrect bioproject accession in project table."
        rows = find_conditions_in_db(
            db_config,
            "submission_table",
            conditions={"accession": accession, "version": version},
        )
        assert in_submission_table(
            db_config,
            {"accession": accession, "version": version, "status_all": StatusAll.SUBMITTED_PROJECT},
        ), f"Sequence {accession}.{version} not in state SUBMITTED_PROJECT submission table."


def check_project_submission_has_errors(
    db_config: SimpleConnectionPool, sequences_to_upload: dict[str, Any]
):
    for full_accession, data in sequences_to_upload.items():
        group_id = data["metadata"]["groupId"]
        organism = data["organism"]
        rows = find_conditions_in_db(
            db_config,
            "project_table",
            conditions={"group_id": group_id, "organism": organism, "status": "HAS_ERRORS"},
        )
        assert len(rows) == 1, (
            f"Project {group_id} for {full_accession} not found in project table."
        )
        bioproject = data["metadata"]["bioprojectAccession"]
        if bioproject:
            assert (
                len([row["result"].get("bioproject_accession") == bioproject for row in rows]) == 1
            ), "Incorrect bioproject accession in project table."


class SubmissionTests(unittest.TestCase):
    def setUp(self):
        setup_test_db()
        self.config: Config = get_config(config_file)
        self.db_config = db_init(
            self.config.db_password, self.config.db_username, self.config.db_url
        )
        delete_all_records(self.db_config)
        self.slack_config = SlackConfig(
            slack_hook=self.config.slack_hook,
            slack_token=self.config.slack_token,
            slack_channel_id=self.config.slack_channel_id,
            last_notification_sent=datetime.now(tz=pytz.utc) - timedelta(days=1),
        )
        assert self.config.ena_submission_url == "https://wwwdev.ebi.ac.uk/ena/submit/drop-box/submit", f"ENA submission URL is {self.config.ena_submission_url} instead of https://wwwdev.ebi.ac.uk/ena/submit/drop-box/submit/"

    def test_submit(self):
        with open(input_file, encoding="utf-8") as json_file:
            sequences_to_upload: dict[str, Any] = json.load(json_file)
            upload_sequences(self.db_config, sequences_to_upload)
            check_sequences_uploaded(self.db_config, sequences_to_upload)

            create_project_submission_table_start(self.db_config, self.config)
            check_project_submission_started(self.db_config, sequences_to_upload)

            # project_table_create(db_config, config, test=config.test)
            # check_project_submission_submitted(db_config, sequences_to_upload)
            # submit sample
            # submit assembly
            # update external metadata
            delete_all_records(self.db_config)


class KnownBioproject(SubmissionTests):
    @patch("ena_deposition.create_project.get_group_info")
    def test_submit(self, mock_make_request):
        mock_make_request.return_value = [
            {"group": {"institution": "test", "bioprojectAccession": "PRJNA231221"}}
        ]
        with open(input_file, encoding="utf-8") as json_file:
            sequences_to_upload: dict[str, Any] = json.load(json_file)
            for entry in sequences_to_upload.values():
                entry["metadata"]["bioprojectAccession"] = "PRJNA231221"
            upload_sequences(self.db_config, sequences_to_upload)
            check_sequences_uploaded(self.db_config, sequences_to_upload)

            create_project_submission_table_start(self.db_config, self.config)
            check_project_submission_submitted(self.db_config, sequences_to_upload)

            create_sample_submission_table_start(self.db_config)
            check_sample_submission_started(self.db_config, sequences_to_upload)
            # submit sample
            # submit assembly
            # update external metadata
            delete_all_records(self.db_config)


class IncorrectBioprojectPassed(SubmissionTests):
    @patch("ena_deposition.notifications.notify")
    def test_submit(self, mock_notify):
        mock_notify.return_value = None
        with open(input_file, encoding="utf-8") as json_file:
            sequences_to_upload: dict[str, Any] = json.load(json_file)
            for entry in sequences_to_upload.values():
                entry["metadata"]["bioprojectAccession"] = "INVALID_ACCESSION"
            upload_sequences(self.db_config, sequences_to_upload)
            check_sequences_uploaded(self.db_config, sequences_to_upload)

            create_project_submission_table_start(self.db_config, self.config)
            check_project_submission_has_errors(self.db_config, sequences_to_upload)
            project_table_handle_errors(
                self.db_config, self.config, self.slack_config, time_threshold=0
            )
            msg = f"{self.config.backend_url}: ENA Submission pipeline found 1 entries in project_table in status HAS_ERRORS or SUBMITTING for over 0m"
            mock_notify.assert_called_once_with(self.slack_config, msg)
            delete_all_records(self.db_config)


class KnownBioprojectAndBioSample(SubmissionTests):
    @patch("ena_deposition.create_project.get_group_info")
    def test_submit(self, mock_make_request):
        mock_make_request.return_value = [
            {"group": {"institution": "test", "bioprojectAccession": "PRJNA231221"}}
        ]
        with open(input_file, encoding="utf-8") as json_file:
            sequences_to_upload: dict[str, Any] = json.load(json_file)
            for entry in sequences_to_upload.values():
                entry["metadata"]["bioprojectAccession"] = "PRJNA231221"
                entry["metadata"]["biosampleAccession"] = "SAMN11077987"
            upload_sequences(self.db_config, sequences_to_upload)
            check_sequences_uploaded(self.db_config, sequences_to_upload)

            create_project_submission_table_start(self.db_config, self.config)
            check_project_submission_submitted(self.db_config, sequences_to_upload)

            create_sample_submission_table_start(self.db_config)
            check_sample_submission_submitted(self.db_config, sequences_to_upload)
            # submit assembly
            # update external metadata
            delete_all_records(self.db_config)


class KnownBioprojectAndIncorrectBioSample(SubmissionTests):
    @patch("ena_deposition.create_project.get_group_info", autospec=True)
    @patch("ena_deposition.notifications.notify", autospec=True)
    def test_submit(self, mock_notify, mock_get_group_info):
        mock_get_group_info.return_value = [
            {"group": {"institution": "test", "bioprojectAccession": "PRJNA231221"}}
        ]
        mock_notify.return_value = None
        with open(input_file, encoding="utf-8") as json_file:
            sequences_to_upload: dict[str, Any] = json.load(json_file)
            for entry in sequences_to_upload.values():
                entry["metadata"]["bioprojectAccession"] = "PRJNA231221"
                entry["metadata"]["biosampleAccession"] = "INVALID_ACCESSION"
            upload_sequences(self.db_config, sequences_to_upload)
            check_sequences_uploaded(self.db_config, sequences_to_upload)

            create_project_submission_table_start(self.db_config, self.config)
            check_project_submission_submitted(self.db_config, sequences_to_upload)

            create_sample_submission_table_start(self.db_config)
            check_sample_submission_has_errors(self.db_config, sequences_to_upload)
            sample_table_handle_errors(self.db_config, self.config, self.slack_config, time_threshold=0)
            msg = f"{self.config.backend_url}: ENA Submission pipeline found 1 entries in sample_table in status HAS_ERRORS or SUBMITTING for over 0m"
            mock_notify.assert_called_once_with(self.slack_config, msg)
            delete_all_records(self.db_config)


if __name__ == "__main__":
    unittest.main()
