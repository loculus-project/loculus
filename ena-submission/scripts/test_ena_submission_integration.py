# run
# docker run --name test-postgres -e POSTGRES_USER=postgres -e POSTGRES_PASSWORD=unsecure -e POSTGRES_DB=loculus -p 5432:5432 -d postgres
# flyway -url=jdbc:postgresql://localhost:5432/loculus -schemas=ena_deposition_schema -user=postgres -password=unsecure -locations=filesystem:./flyway/sql migrate
import json
import unittest
from datetime import datetime, timedelta
from typing import Any
from unittest.mock import patch

import pytz
from ena_deposition.config import Config, get_config
from ena_deposition.create_assembly import (
    assembly_table_create,
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
    submission_table_start as create_project_submission_table_start,
)
from ena_deposition.create_project import (
    submission_table_update as create_project_submission_table_update,
)
from ena_deposition.create_sample import (
    sample_table_create,
    sample_table_handle_errors,
)
from ena_deposition.create_sample import (
    submission_table_start as create_sample_submission_table_start,
)
from ena_deposition.create_sample import (
    submission_table_update as create_sample_submission_table_update,
)
from ena_deposition.notifications import SlackConfig
from ena_deposition.submission_db_helper import (
    StatusAll,
    db_init,
    delete_records_in_db,
    find_conditions_in_db,
    in_submission_table,
    update_db_where_conditions,
)
from ena_deposition.trigger_submission_to_ena import upload_sequences
from psycopg2.pool import SimpleConnectionPool

config_file = "./test/test_config.yaml"
input_file = "./test/approved_ena_submission_list_test.json"


def delete_all_records(db_config: SimpleConnectionPool):
    for table_name in ["submission_table", "project_table", "sample_table", "assembly_table"]:
        delete_records_in_db(db_config, table_name, {})


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


def check_assembly_submission_waiting(
    db_config: SimpleConnectionPool, sequences_to_upload: dict[str, Any]
):
    for full_accession in sequences_to_upload:
        accession, version = full_accession.split(".")
        rows = find_conditions_in_db(
            db_config,
            "assembly_table",
            conditions={"accession": accession, "version": version, "status": "WAITING"},
        )
        assert len(rows) == 1, f"Assembly for {full_accession} not found in assembly table."
        assert "erz_accession" in rows[0]["result"], "Incorrect assembly result in assembly table."
        assert "segment_order" in rows[0]["result"], "Incorrect assembly result in assembly table."


def check_assembly_submission_started(
    db_config: SimpleConnectionPool, sequences_to_upload: dict[str, Any]
):
    for full_accession in sequences_to_upload:
        accession, version = full_accession.split(".")
        rows = find_conditions_in_db(
            db_config,
            "assembly_table",
            conditions={"accession": accession, "version": version, "status": "READY"},
        )
        assert len(rows) == 1, f"Assembly for {full_accession} not found in assembly table."


def check_assembly_submission_submitted(
    db_config: SimpleConnectionPool, sequences_to_upload: dict[str, Any]
):
    for full_accession in sequences_to_upload:
        accession, version = full_accession.split(".")
        rows = find_conditions_in_db(
            db_config,
            "assembly_table",
            conditions={"accession": accession, "version": version, "status": "SUBMITTED"},
        )
        assert len(rows) == 1, f"Assembly for {full_accession} not found in assembly table."
        rows = find_conditions_in_db(
            db_config,
            "submission_table",
            conditions={"accession": accession, "version": version},
        )
        assert in_submission_table(
            db_config,
            {
                "accession": accession,
                "version": version,
                "status_all": StatusAll.SUBMITTED_ALL,
            },
        ), f"Sequence {accession}.{version} not in state SUBMITTED_ALL submission table."


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


def set_db_to_known_erz_accession(
    db_config: SimpleConnectionPool, sequences_to_upload: dict[str, Any]
):
    for full_accession, data in sequences_to_upload.items():
        accession, version = full_accession.split(".")
        organism = data["organism"]
        if organism == "cchf":
            update_db_where_conditions(
                db_config,
                "assembly_table",
                {"accession": accession, "version": version},
                {
                    "result": json.dumps(
                        {"erz_accession": "ERZ24784470", "segment_order": ["L", "M"]}
                    )
                },
            )
        if organism == "west-nile":
            update_db_where_conditions(
                db_config,
                "assembly_table",
                {"accession": accession, "version": version},
                {
                    "result": json.dumps(
                        {"erz_accession": "ERZ24908522", "segment_order": ["main"]}
                    )
                },
            )


class SubmissionTests(unittest.TestCase):
    def setUp(self):
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
        assert (
            self.config.ena_submission_url == "https://wwwdev.ebi.ac.uk/ena/submit/drop-box/submit"
        ), (
            f"ENA submission URL is {self.config.ena_submission_url} instead of https://wwwdev.ebi.ac.uk/ena/submit/drop-box/submit/"
        )
        assert self.config.test, "Test mode is not enabled."

    @patch("ena_deposition.create_project.get_group_info")
    def test_submit(self, mock_get_group_info):
        mock_get_group_info.return_value = [
            {
                "group": {
                    "institution": "University of Test",
                    "address": {"city": "test city", "country": "Switzerland"},
                    "groupName": "test group",
                }
            }
        ]
        with open(input_file, encoding="utf-8") as json_file:
            sequences_to_upload: dict[str, Any] = json.load(json_file)
            upload_sequences(self.db_config, sequences_to_upload)
            check_sequences_uploaded(self.db_config, sequences_to_upload)

            create_project_submission_table_start(self.db_config, self.config)
            check_project_submission_started(self.db_config, sequences_to_upload)

            project_table_create(self.db_config, self.config, test=self.config.test)
            create_project_submission_table_update(self.db_config)
            check_project_submission_submitted(self.db_config, sequences_to_upload)

            create_sample_submission_table_start(self.db_config)
            check_sample_submission_started(self.db_config, sequences_to_upload)

            sample_table_create(self.db_config, self.config, test=self.config.test)
            create_sample_submission_table_update(self.db_config)
            check_sample_submission_submitted(self.db_config, sequences_to_upload)

            create_assembly_submission_table_start(self.db_config)
            check_assembly_submission_started(self.db_config, sequences_to_upload)

            assembly_table_create(self.db_config, self.config, test=self.config.test)
            check_assembly_submission_waiting(self.db_config, sequences_to_upload)

            set_db_to_known_erz_accession(self.db_config, sequences_to_upload)
            assembly_table_update(self.db_config, self.config)
            create_assembly_submission_table_update(self.db_config)
            check_assembly_submission_submitted(self.db_config, sequences_to_upload)

            # update external metadata
            delete_all_records(self.db_config)


class KnownBioproject(SubmissionTests):
    @patch("ena_deposition.create_project.get_group_info")
    def test_submit(self, mock_get_group_info):
        mock_get_group_info.return_value = [{"group": {"institution": "test"}}]
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

            sample_table_create(self.db_config, self.config, test=self.config.test)
            create_sample_submission_table_update(self.db_config)
            check_sample_submission_submitted(self.db_config, sequences_to_upload)

            create_assembly_submission_table_start(self.db_config)
            check_assembly_submission_started(self.db_config, sequences_to_upload)

            assembly_table_create(self.db_config, self.config, test=self.config.test)
            check_assembly_submission_waiting(self.db_config, sequences_to_upload)

            set_db_to_known_erz_accession(self.db_config, sequences_to_upload)
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
    def test_submit(self, mock_get_group_info):
        mock_get_group_info.return_value = [{"group": {"institution": "test"}}]
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

            create_assembly_submission_table_start(self.db_config)
            check_assembly_submission_started(self.db_config, sequences_to_upload)

            assembly_table_create(self.db_config, self.config, test=self.config.test)
            check_assembly_submission_waiting(self.db_config, sequences_to_upload)
            # update external metadata
            delete_all_records(self.db_config)


class KnownBioprojectAndIncorrectBioSample(SubmissionTests):
    @patch("ena_deposition.create_project.get_group_info", autospec=True)
    @patch("ena_deposition.notifications.notify", autospec=True)
    def test_submit(self, mock_notify, mock_get_group_info):
        mock_get_group_info.return_value = [{"group": {"institution": "test"}}]
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
            sample_table_handle_errors(
                self.db_config, self.config, self.slack_config, time_threshold=0
            )
            msg = f"{self.config.backend_url}: ENA Submission pipeline found 1 entries in sample_table in status HAS_ERRORS or SUBMITTING for over 0m"
            mock_notify.assert_called_once_with(self.slack_config, msg)
            delete_all_records(self.db_config)


if __name__ == "__main__":
    unittest.main()
