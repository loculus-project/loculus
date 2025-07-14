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
import json
import logging
import uuid
from datetime import datetime, timedelta
from typing import Any, Final
from unittest.mock import Mock, patch

import pytz
from ena_deposition.config import Config, get_config
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
from ena_deposition.loculus_models import Group
from ena_deposition.notifications import SlackConfig
from ena_deposition.submission_db_helper import (
    StatusAll,
    TableName,
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
from psycopg2.pool import SimpleConnectionPool

CONFIG_FILE = "./test/test_config.yaml"
INPUT_FILE = "./test/approved_ena_submission_list_test.json"


logger = logging.getLogger(__name__)

TEST_GROUP: Final = Group._create_example_for_tests()


def assert_biosample_accession(
    rows: list[dict[str, Any]], biosample_accession: str, full_accession: str
) -> None:
    assert len(rows) == 1, f"Sample for {full_accession} not found in sample table."
    if biosample_accession:
        assert rows[0]["result"].get("biosample_accession") == biosample_accession, (
            "Incorrect biosample accession in sample table."
        )


def assert_bioproject_accession(
    rows: list[dict[str, Any]], bioproject_accession: str, group_id: str, full_accession: str
) -> None:
    assert len(rows) == 1, f"Project {group_id} for {full_accession} not found in project table."
    if bioproject_accession:
        assert rows[0]["result"].get("bioproject_accession") == bioproject_accession, (
            "Incorrect bioproject accession in project table."
        )


def delete_all_records(db_config: SimpleConnectionPool) -> None:
    logger.debug("Deleting all records from all deposition tables except flyway")
    for table_name in [
        TableName.SUBMISSION_TABLE,
        TableName.PROJECT_TABLE,
        TableName.SAMPLE_TABLE,
        TableName.ASSEMBLY_TABLE,
    ]:
        delete_records_in_db(db_config, table_name, {})


def check_sequences_uploaded(
    db_config: SimpleConnectionPool, sequences_to_upload: dict[str, Any]
) -> None:
    for full_accession in sequences_to_upload:
        accession, version = full_accession.split(".")
        assert in_submission_table(
            db_config, {"accession": accession, "version": version, "status_all": "READY_TO_SUBMIT"}
        ), f"Sequence {accession}.{version} not found in submission table."


def check_project_submission_started(
    db_config: SimpleConnectionPool, sequences_to_upload: dict[str, Any]
) -> None:
    for full_accession, data in sequences_to_upload.items():
        group_id = data["metadata"]["groupId"]
        organism = data["organism"]
        assert (
            len(
                find_conditions_in_db(
                    db_config,
                    TableName.PROJECT_TABLE,
                    conditions={"group_id": group_id, "organism": organism, "status": "READY"},
                )
            )
            == 1
        ), f"Project {group_id} for {full_accession} not found in project table."


def check_sample_submission_started(
    db_config: SimpleConnectionPool, sequences_to_upload: dict[str, Any]
) -> None:
    for full_accession in sequences_to_upload:
        accession, version = full_accession.split(".")
        assert (
            len(
                find_conditions_in_db(
                    db_config,
                    TableName.SAMPLE_TABLE,
                    conditions={"accession": accession, "version": version, "status": "READY"},
                )
            )
            == 1
        ), f"Sample for {full_accession} not found in sample table."


def check_sample_submission_submitted(
    db_config: SimpleConnectionPool, sequences_to_upload: dict[str, Any]
) -> None:
    for full_accession, data in sequences_to_upload.items():
        accession, version = full_accession.split(".")
        rows = find_conditions_in_db(
            db_config,
            TableName.SAMPLE_TABLE,
            conditions={"accession": accession, "version": version, "status": "SUBMITTED"},
        )
        assert_biosample_accession(rows, data["metadata"]["biosampleAccession"], full_accession)
        assert in_submission_table(
            db_config,
            {"accession": accession, "version": version, "status_all": StatusAll.SUBMITTED_SAMPLE},
        ), f"Sequence {accession}.{version} not in state SUBMITTED_SAMPLE submission table."


def check_sample_submission_has_errors(
    db_config: SimpleConnectionPool, sequences_to_upload: dict[str, Any]
) -> None:
    for full_accession, data in sequences_to_upload.items():
        accession, version = full_accession.split(".")
        rows = find_conditions_in_db(
            db_config,
            TableName.SAMPLE_TABLE,
            conditions={"accession": accession, "version": version, "status": "HAS_ERRORS"},
        )
        assert_biosample_accession(rows, data["metadata"]["biosampleAccession"], full_accession)


def check_assembly_submission_waiting(
    db_config: SimpleConnectionPool, sequences_to_upload: dict[str, Any]
) -> None:
    for full_accession in sequences_to_upload:
        accession, version = full_accession.split(".")
        rows = find_conditions_in_db(
            db_config,
            TableName.ASSEMBLY_TABLE,
            conditions={"accession": accession, "version": version, "status": "WAITING"},
        )
        assert len(rows) == 1, f"Assembly for {full_accession} not found in assembly table."
        assert "erz_accession" in rows[0]["result"], "Incorrect assembly result in assembly table."
        assert "segment_order" in rows[0]["result"], "Incorrect assembly result in assembly table."


def check_assembly_submission_has_errors(
    db_config: SimpleConnectionPool, sequences_to_upload: dict[str, Any]
) -> None:
    for full_accession in sequences_to_upload:
        accession, version = full_accession.split(".")
        rows = find_conditions_in_db(
            db_config,
            TableName.ASSEMBLY_TABLE,
            conditions={"accession": accession, "version": version, "status": "HAS_ERRORS"},
        )
        assert len(rows) == 1, f"Assembly for {full_accession} not found in assembly table."


def check_assembly_submission_started(
    db_config: SimpleConnectionPool, sequences_to_upload: dict[str, Any]
) -> None:
    for full_accession in sequences_to_upload:
        accession, version = full_accession.split(".")
        rows = find_conditions_in_db(
            db_config,
            TableName.ASSEMBLY_TABLE,
            conditions={"accession": accession, "version": version, "status": "READY"},
        )
        assert len(rows) == 1, f"Assembly for {full_accession} not found in assembly table."


def check_assembly_submission_submitted(
    db_config: SimpleConnectionPool, sequences_to_upload: dict[str, Any]
) -> None:
    for full_accession in sequences_to_upload:
        accession, version = full_accession.split(".")
        rows = find_conditions_in_db(
            db_config,
            TableName.ASSEMBLY_TABLE,
            conditions={"accession": accession, "version": version, "status": "SUBMITTED"},
        )
        assert len(rows) == 1, f"Assembly for {full_accession} not found in assembly table."
        assert in_submission_table(
            db_config,
            {
                "accession": accession,
                "version": version,
                "status_all": StatusAll.SUBMITTED_ALL,
            },
        ), f"Sequence {accession}.{version} not in state SUBMITTED_ALL submission table."


def check_sent_to_loculus(
    db_config: SimpleConnectionPool, sequences_to_upload: dict[str, Any]
) -> None:
    for full_accession in sequences_to_upload:
        accession, version = full_accession.split(".")
        assert in_submission_table(
            db_config,
            {
                "accession": accession,
                "version": version,
                "status_all": StatusAll.SENT_TO_LOCULUS,
            },
        ), f"Sequence {accession}.{version} not in state SENT_TO_LOCULUS submission table."


def check_project_submission_submitted(
    db_config: SimpleConnectionPool, sequences_to_upload: dict[str, Any]
) -> None:
    for full_accession, data in sequences_to_upload.items():
        accession, version = full_accession.split(".")
        group_id = data["metadata"]["groupId"]
        organism = data["organism"]
        rows = find_conditions_in_db(
            db_config,
            TableName.PROJECT_TABLE,
            conditions={"group_id": group_id, "organism": organism, "status": "SUBMITTED"},
        )
        assert_bioproject_accession(
            rows, data["metadata"]["bioprojectAccession"], group_id, full_accession
        )
        assert in_submission_table(
            db_config,
            {"accession": accession, "version": version, "status_all": StatusAll.SUBMITTED_PROJECT},
        ), f"Sequence {accession}.{version} not in state SUBMITTED_PROJECT submission table."


def check_project_submission_has_errors(
    db_config: SimpleConnectionPool, sequences_to_upload: dict[str, Any]
) -> None:
    for full_accession, data in sequences_to_upload.items():
        group_id = data["metadata"]["groupId"]
        organism = data["organism"]
        rows = find_conditions_in_db(
            db_config,
            TableName.PROJECT_TABLE,
            conditions={"group_id": group_id, "organism": organism, "status": "HAS_ERRORS"},
        )
        assert_bioproject_accession(
            rows, data["metadata"]["bioprojectAccession"], group_id, full_accession
        )


def set_db_to_known_erz_accession(
    db_config: SimpleConnectionPool, sequences_to_upload: dict[str, Any]
) -> None:
    """Sets erz-accession to known public accessions"""
    for full_accession, data in sequences_to_upload.items():
        accession, version = full_accession.split(".")
        organism = data["organism"]
        if organism == "cchf":
            update_db_where_conditions(
                db_config,
                TableName.ASSEMBLY_TABLE,
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
                TableName.ASSEMBLY_TABLE,
                {"accession": accession, "version": version},
                {"result": json.dumps({"erz_accession": "ERZ24908522", "segment_order": ["main"]})},
            )


def _test_successful_assembly_submission(
    db_config: SimpleConnectionPool, config: Config, sequences_to_upload: dict[str, Any]
) -> None:
    create_assembly_submission_table_start(db_config)
    check_assembly_submission_started(db_config, sequences_to_upload)

    assert config.test, "Not submitting to dev - stopping"

    # IMPORTANT: set test=true below or this script may submit sequences to ENA prod
    assembly_table_create(db_config, config, test=config.test)
    check_assembly_submission_waiting(db_config, sequences_to_upload)

    # Hack: ENA never processed on dev, so we set erz_accession to known public accessions
    # So we can test the rest of the pipeline
    set_db_to_known_erz_accession(db_config, sequences_to_upload)
    assembly_table_update(db_config, config, time_threshold=0)
    create_assembly_submission_table_update(db_config)
    check_assembly_submission_submitted(db_config, sequences_to_upload)


def _test_successful_assembly_submission_no_wait(
    db_config: SimpleConnectionPool, config: Config, sequences_to_upload: dict[str, Any]
) -> None:
    create_assembly_submission_table_start(db_config)
    check_assembly_submission_started(db_config, sequences_to_upload)

    assert config.test, "Not submitting to dev - stopping"

    # IMPORTANT: set test=true below or this script may submit sequences to ENA prod
    assembly_table_create(db_config, config, test=config.test)
    check_assembly_submission_submitted(db_config, sequences_to_upload)


def _test_assembly_submission_errored(
    db_config: SimpleConnectionPool,
    config: Config,
    slack_config: SlackConfig,
    sequences_to_upload: dict[str, Any],
    mock_notify: Mock,
) -> None:
    create_assembly_submission_table_start(db_config)
    check_assembly_submission_started(db_config, sequences_to_upload)

    assert config.test, "Not submitting to dev - stopping"

    # IMPORTANT: set test=true below or this script may submit sequences to ENA prod
    assembly_table_create(db_config, config, test=config.test)
    check_assembly_submission_has_errors(db_config, sequences_to_upload)

    assembly_table_handle_errors(db_config, config, slack_config, time_threshold=0)
    msg = (
        f"{config.backend_url}: ENA Submission pipeline found 1 entries in assembly_table in "
        "status HAS_ERRORS or SUBMITTING for over 0m"
    )
    mock_notify.assert_called_once_with(slack_config, msg)


def _test_successful_sample_submission(
    db_config: SimpleConnectionPool, config: Config, sequences_to_upload: dict[str, Any]
) -> None:
    create_sample_submission_table_start(db_config, config=config)
    check_sample_submission_started(db_config, sequences_to_upload)

    sample_table_create(db_config, config, test=config.test)
    create_sample_submission_table_update(db_config)
    check_sample_submission_submitted(db_config, sequences_to_upload)


def _test_successful_project_submission(
    db_config: SimpleConnectionPool, config: Config, sequences_to_upload: dict[str, Any]
) -> None:
    create_project_submission_table_start(db_config, config)
    check_project_submission_started(db_config, sequences_to_upload)

    project_table_create(db_config, config, test=config.test)
    create_project_submission_table_update(db_config)
    check_project_submission_submitted(db_config, sequences_to_upload)


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
                new_value["metadata"]["authors"] = "Author, Revised;"
            revised_sequences[accession_version] = new_value
        return revised_sequences


def mock_requests_post() -> Mock:
    mock_response = Mock()
    mock_response.status_code = 204
    mock_response.ok = True
    return mock_response


def simple_submission(
    db_config: SimpleConnectionPool,
    config: Config,
    mock_get_group_info: Mock,
    mock_submit_external_metadata: Mock,
) -> None:
    mock_get_group_info.return_value = TEST_GROUP
    mock_submit_external_metadata.return_value = mock_requests_post()
    sequences_to_upload: Final = get_sequences()

    upload_sequences(db_config, sequences_to_upload)
    check_sequences_uploaded(db_config, sequences_to_upload)

    _test_successful_project_submission(db_config, config, sequences_to_upload)
    _test_successful_sample_submission(db_config, config, sequences_to_upload)
    _test_successful_assembly_submission(db_config, config, sequences_to_upload)

    get_external_metadata_and_send_to_loculus(db_config, config)
    check_sent_to_loculus(db_config, sequences_to_upload)


class TestSubmission:
    def setup_method(self) -> None:
        self.config: Config = get_config(CONFIG_FILE)
        self.db_config = db_init(
            self.config.db_password, self.config.db_username, self.config.db_url
        )
        delete_all_records(self.db_config)
        # for testing set last_notification_sent to 1 day ago
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


class TestSimpleSubmission(TestSubmission):
    @patch(
        "ena_deposition.upload_external_metadata_to_loculus.submit_external_metadata", autospec=True
    )
    @patch("ena_deposition.call_loculus.get_group_info", autospec=True)
    def test_submit(self, mock_get_group_info: Mock, mock_submit_external_metadata: Mock) -> None:
        """
        Test the full ENA submission pipeline with accurate data - this should succeed
        """
        simple_submission(
            self.db_config, self.config, mock_get_group_info, mock_submit_external_metadata
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
        sequences_to_upload = get_sequences()
        for entry in sequences_to_upload.values():  # set to known public bioproject
            entry["metadata"]["bioprojectAccession"] = "PRJNA231221"

        # upload sequences
        upload_sequences(self.db_config, sequences_to_upload)
        check_sequences_uploaded(self.db_config, sequences_to_upload)

        # submit
        create_project_submission_table_start(self.db_config, self.config)
        check_project_submission_submitted(self.db_config, sequences_to_upload)
        _test_successful_sample_submission(self.db_config, self.config, sequences_to_upload)
        _test_successful_assembly_submission(self.db_config, self.config, sequences_to_upload)

        # send to loculus
        get_external_metadata_and_send_to_loculus(self.db_config, self.config)
        check_sent_to_loculus(self.db_config, sequences_to_upload)


class TestIncorrectBioprojectPassed(TestSubmission):
    @patch("ena_deposition.notifications.notify", autospec=True)
    def test_submit(self, mock_notify: Mock) -> None:
        """
        Test submitting sequences with an incorrect bioproject - this should fail
        """
        # get data
        mock_notify.return_value = None
        sequences_to_upload = get_sequences()
        for entry in sequences_to_upload.values():  # set to invalid bioproject
            entry["metadata"]["bioprojectAccession"] = "INVALID_ACCESSION"

        # upload sequences
        upload_sequences(self.db_config, sequences_to_upload)
        check_sequences_uploaded(self.db_config, sequences_to_upload)

        # check project submission fails and sends notification
        create_project_submission_table_start(self.db_config, self.config)
        check_project_submission_has_errors(self.db_config, sequences_to_upload)
        project_table_handle_errors(
            self.db_config, self.config, self.slack_config, time_threshold=0
        )
        msg = (
            f"{self.config.backend_url}: ENA Submission pipeline found 1 entries in project_table "
            "in status HAS_ERRORS or SUBMITTING for over 0m"
        )
        mock_notify.assert_called_once_with(self.slack_config, msg)


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
        sequences_to_upload = get_sequences()
        for entry in sequences_to_upload.values():  # set to public bioproject and biosample
            entry["metadata"]["bioprojectAccession"] = "PRJNA231221"
            entry["metadata"]["biosampleAccession"] = "SAMN11077987"

        # upload
        upload_sequences(self.db_config, sequences_to_upload)
        check_sequences_uploaded(self.db_config, sequences_to_upload)

        # submit
        create_project_submission_table_start(self.db_config, self.config)
        check_project_submission_submitted(self.db_config, sequences_to_upload)
        create_sample_submission_table_start(self.db_config, config=self.config)
        check_sample_submission_submitted(self.db_config, sequences_to_upload)
        _test_successful_assembly_submission(self.db_config, self.config, sequences_to_upload)

        # send to loculus
        get_external_metadata_and_send_to_loculus(self.db_config, self.config)
        check_sent_to_loculus(self.db_config, sequences_to_upload)


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
        sequences_to_upload = get_sequences()
        for entry in sequences_to_upload.values():  # set to invalid biosample
            entry["metadata"]["bioprojectAccession"] = "PRJNA231221"
            entry["metadata"]["biosampleAccession"] = "INVALID_ACCESSION"

        # upload
        upload_sequences(self.db_config, sequences_to_upload)
        check_sequences_uploaded(self.db_config, sequences_to_upload)

        # submit project
        create_project_submission_table_start(self.db_config, self.config)
        check_project_submission_submitted(self.db_config, sequences_to_upload)

        # check sample submission fails and sends notification
        create_sample_submission_table_start(self.db_config, config=self.config)
        check_sample_submission_has_errors(self.db_config, sequences_to_upload)
        sample_table_handle_errors(self.db_config, self.config, self.slack_config, time_threshold=0)
        msg = (
            f"{self.config.backend_url}: ENA Submission pipeline found 1 entries in sample_table "
            "in status HAS_ERRORS or SUBMITTING for over 0m"
        )
        mock_notify.assert_called_once_with(self.slack_config, msg)


class TestRevisionAssemblyModificationTests(TestSubmission):
    @patch(
        "ena_deposition.upload_external_metadata_to_loculus.submit_external_metadata", autospec=True
    )
    @patch("ena_deposition.call_loculus.get_group_info", autospec=True)
    def test_revise(self, mock_get_group_info: Mock, mock_submit_external_metadata: Mock) -> None:
        self.config.set_alias_suffix = "revision" + str(uuid.uuid4())
        simple_submission(
            self.db_config, self.config, mock_get_group_info, mock_submit_external_metadata
        )

        # get data
        mock_get_group_info.return_value = TEST_GROUP
        mock_submit_external_metadata.return_value = mock_requests_post()
        sequences_to_upload = get_revisions()

        # upload sequences
        upload_sequences(self.db_config, sequences_to_upload)
        check_sequences_uploaded(self.db_config, sequences_to_upload)

        # submit
        create_project_submission_table_start(self.db_config, self.config)
        check_project_submission_submitted(self.db_config, sequences_to_upload)
        _test_successful_sample_submission(self.db_config, self.config, sequences_to_upload)
        _test_successful_assembly_submission(self.db_config, self.config, sequences_to_upload)

        # send to loculus
        get_external_metadata_and_send_to_loculus(self.db_config, self.config)
        check_sent_to_loculus(self.db_config, sequences_to_upload)


class TestRevisionNoAssemblyModificationTests(TestSubmission):
    @patch(
        "ena_deposition.upload_external_metadata_to_loculus.submit_external_metadata", autospec=True
    )
    @patch("ena_deposition.call_loculus.get_group_info", autospec=True)
    def test_revise(self, mock_get_group_info: Mock, mock_submit_external_metadata: Mock) -> None:
        self.config.set_alias_suffix = "revision" + str(uuid.uuid4())
        simple_submission(
            self.db_config, self.config, mock_get_group_info, mock_submit_external_metadata
        )

        # get data
        mock_get_group_info.return_value = TEST_GROUP
        mock_submit_external_metadata.return_value = mock_requests_post()
        sequences_to_upload = get_revisions(modify_assembly=False)

        # upload sequences
        upload_sequences(self.db_config, sequences_to_upload)
        check_sequences_uploaded(self.db_config, sequences_to_upload)

        # submit
        create_project_submission_table_start(self.db_config, self.config)
        check_project_submission_submitted(self.db_config, sequences_to_upload)
        _test_successful_sample_submission(self.db_config, self.config, sequences_to_upload)
        _test_successful_assembly_submission_no_wait(
            self.db_config, self.config, sequences_to_upload
        )

        # send to loculus
        get_external_metadata_and_send_to_loculus(self.db_config, self.config)
        check_sent_to_loculus(self.db_config, sequences_to_upload)


class TestRevisionWithManifestChangeTests(TestSubmission):
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
        simple_submission(
            self.db_config, self.config, mock_get_group_info, mock_submit_external_metadata
        )
        # get data
        mock_get_group_info.return_value = TEST_GROUP
        mock_submit_external_metadata.return_value = mock_requests_post()
        sequences_to_upload = get_revisions(modify_manifest=True)

        # upload sequences
        upload_sequences(self.db_config, sequences_to_upload)
        check_sequences_uploaded(self.db_config, sequences_to_upload)

        # submit
        create_project_submission_table_start(self.db_config, self.config)
        check_project_submission_submitted(self.db_config, sequences_to_upload)
        _test_successful_sample_submission(self.db_config, self.config, sequences_to_upload)

        # check notified cannot submit assembly
        _test_assembly_submission_errored(
            self.db_config, self.config, self.slack_config, sequences_to_upload, mock_notify
        )


if __name__ == "__main__":
    import pytest

    pytest.main([__file__])
