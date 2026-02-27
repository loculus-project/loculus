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
import re
import uuid
from dataclasses import asdict
from datetime import datetime, timedelta
from typing import Any, Final
from unittest.mock import Mock, patch

import pytest
import pytz
from ena_deposition.check_external_visibility import (
    COLUMN_CONFIGS,
    EntityType,
    check_and_update_visibility_for_column,
)
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
    Status,
    StatusAll,
    TableName,
    add_to_assembly_table,
    add_to_project_table,
    add_to_sample_table,
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
        assert len(rows) == 1, (
            f"Assembly for {full_accession} not in state 'SUBMITTED' in assembly table."
        )
        assert in_submission_table(
            db_config,
            {
                "accession": accession,
                "version": version,
                "status_all": StatusAll.SUBMITTED_ALL,
            },
        ), f"Sequence {accession}.{version} not in state SUBMITTED_ALL submission table."


def check_assembly_submission_with_nuc_without_gca(
    db_config: SimpleConnectionPool, sequences_to_upload: dict[str, Any]
) -> None:
    for full_accession in sequences_to_upload:
        accession, version = full_accession.split(".")
        rows = find_conditions_in_db(
            db_config,
            TableName.ASSEMBLY_TABLE,
            conditions={
                "accession": accession,
                "version": version,
                "status": "WAITING",
            },
        )
        assert len(rows) == 1, (
            f"Assembly for {full_accession} not in state 'WAITING' in assembly table."
        )
        assert rows[0]["result"].get("insdc_accession_full_L") is not None
        assert rows[0]["result"].get("insdc_accession_full_M") is None
        assert rows[0]["result"].get("gca_accession") is None


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
    db_config: SimpleConnectionPool, sequences_to_upload: dict[str, Any], single_segment: bool
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
                db_config,
                TableName.ASSEMBLY_TABLE,
                {"accession": accession, "version": version},
                {
                    "result": json.dumps(
                        {"erz_accession": erz_accession, "segment_order": segment_order}
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
    db_config: SimpleConnectionPool,
    config: Config,
    sequences_to_upload: dict[str, Any],
    single_segment: bool = False,
) -> None:
    create_assembly_submission_table_start(db_config, config)
    check_assembly_submission_started(db_config, sequences_to_upload)

    assert config.test, "Not submitting to dev - stopping"
    assembly_table_create(db_config, config)
    check_assembly_submission_waiting(db_config, sequences_to_upload)

    # Hack: ENA never processed on dev, so we set erz_accession to known public accessions
    # So we can test the rest of the pipeline
    set_db_to_known_erz_accession(db_config, sequences_to_upload, single_segment=single_segment)
    assembly_table_update(db_config, config, time_threshold=0)
    create_assembly_submission_table_update(db_config)
    if single_segment:
        check_assembly_submission_with_nuc_without_gca(db_config, sequences_to_upload)
    else:
        check_assembly_submission_submitted(db_config, sequences_to_upload)


def _test_successful_assembly_submission_no_wait(
    db_config: SimpleConnectionPool, config: Config, sequences_to_upload: dict[str, Any]
) -> None:
    create_assembly_submission_table_start(db_config, config)
    check_assembly_submission_started(db_config, sequences_to_upload)

    assert config.test, "Not submitting to dev - stopping"
    assembly_table_create(db_config, config)
    create_assembly_submission_table_update(db_config)
    check_assembly_submission_submitted(db_config, sequences_to_upload)


def _test_assembly_submission_errored(
    db_config: SimpleConnectionPool,
    config: Config,
    slack_config: SlackConfig,
    sequences_to_upload: dict[str, Any],
    mock_notify: Mock,
) -> None:
    create_assembly_submission_table_start(db_config, config)
    check_assembly_submission_started(db_config, sequences_to_upload)

    assert config.test, "Not submitting to dev - stopping"
    assembly_table_create(db_config, config)
    check_assembly_submission_has_errors(db_config, sequences_to_upload)

    assembly_table_handle_errors(
        db_config,
        config,
        slack_config,
        last_retry_time=datetime.now(tz=pytz.utc),
    )
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


def multi_segment_submission(
    db_config: SimpleConnectionPool,
    config: Config,
    mock_get_group_info: Mock,
    mock_submit_external_metadata: Mock,
    single_segment: bool = False,
) -> None:
    """Test the full ENA submission pipeline with CCHF data
    If single_segment is True, there's only one segment in the assembly
    Otherwise there are 2"""
    mock_get_group_info.return_value = TEST_GROUP
    mock_submit_external_metadata.return_value = mock_requests_post()
    sequences_to_upload = get_sequences()

    if single_segment:
        # Set segment M to None so we have only one segment in the assembly
        sequences_to_upload["LOC_0001TLY.1"]["unalignedNucleotideSequences"]["M"] = None

    get_external_metadata_and_send_to_loculus(db_config, config)
    mock_submit_external_metadata.assert_not_called()

    upload_sequences(db_config, sequences_to_upload)
    check_sequences_uploaded(db_config, sequences_to_upload)
    get_external_metadata_and_send_to_loculus(db_config, config)
    mock_submit_external_metadata.assert_not_called()

    _test_successful_project_submission(db_config, config, sequences_to_upload)
    get_external_metadata_and_send_to_loculus(db_config, config)
    args = mock_submit_external_metadata.call_args_list

    assert len(args) == 1
    payload = args[0][0][0]  # first positional argument of first call
    assert payload["accession"] == "LOC_0001TLY"
    assert payload["version"] == 1
    assert set(payload["externalMetadata"]) == {"bioprojectAccession"}
    assert payload["externalMetadata"]["bioprojectAccession"].startswith("PRJEB")

    _test_successful_sample_submission(db_config, config, sequences_to_upload)
    get_external_metadata_and_send_to_loculus(db_config, config)
    args = mock_submit_external_metadata.call_args_list
    assert len(args) == 2  # noqa: PLR2004
    payload = args[1][0][0]  # first positional argument of second call
    assert payload["accession"] == "LOC_0001TLY"
    assert payload["version"] == 1
    assert set(payload["externalMetadata"]) == {"bioprojectAccession", "biosampleAccession"}
    assert payload["externalMetadata"]["bioprojectAccession"].startswith("PRJEB")
    assert payload["externalMetadata"]["biosampleAccession"].startswith("SAMEA")

    _test_successful_assembly_submission(db_config, config, sequences_to_upload, single_segment)
    get_external_metadata_and_send_to_loculus(db_config, config)
    if not single_segment:
        # Only complete in case of multi-segment submission
        check_sent_to_loculus(db_config, sequences_to_upload)
    args = mock_submit_external_metadata.call_args_list
    assert len(args) == 3  # noqa: PLR2004
    payload = args[2][0][0]  # first positional argument of third call
    assert payload["accession"] == "LOC_0001TLY"
    assert payload["version"] == 1
    extra_items = set()
    if not single_segment:
        extra_items = {"gcaAccession", "insdcAccessionBase_M", "insdcAccessionFull_M"}
    assert set(payload["externalMetadata"]) == {
        "bioprojectAccession",
        "biosampleAccession",
        "insdcAccessionBase_L",
        "insdcAccessionFull_L",
        *extra_items,
    }
    assert payload["externalMetadata"]["bioprojectAccession"].startswith("PRJEB")
    assert payload["externalMetadata"]["biosampleAccession"].startswith("SAMEA")

    insdc_full_pattern = r"^[A-Z]{2}[0-9]{6}\.[0-9]+$"
    insdc_base_pattern = r"^[A-Z]{2}[0-9]{6}$"
    gca_pattern = r"^GCA_[0-9]{9}\.[0-9]+$"

    assert re.match(insdc_full_pattern, payload["externalMetadata"]["insdcAccessionFull_L"]), (
        f"insdcAccessionFull_L '{payload['externalMetadata']['insdcAccessionFull_L']}' "
        f"does not match INSDC full pattern {insdc_full_pattern}"
    )
    assert re.match(insdc_base_pattern, payload["externalMetadata"]["insdcAccessionBase_L"]), (
        f"insdcAccessionBase_L '{payload['externalMetadata']['insdcAccessionBase_L']}' "
        f"does not match INSDC base pattern {insdc_base_pattern}"
    )
    if not single_segment:
        assert re.match(gca_pattern, payload["externalMetadata"]["gcaAccession"]), (
            f"gcaAccession '{payload['externalMetadata']['gcaAccession']}' "
            f"does not match GCA pattern {gca_pattern}"
        )


class TestSubmission:
    def setup_method(self) -> None:
        self.config: Config = get_config(CONFIG_FILE)
        self.config.submitting_time_threshold_min = 0
        self.db_config = db_init(
            self.config.db_password, self.config.db_username, self.config.db_url
        )
        delete_all_records(self.db_config)
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


class TestFirstPublicUpdate(TestSubmission):
    PROJECT_CONFIG: Final = {
        "invalid_result": {"bioproject_accession": "PRJEB2"},
        "valid_result": {"bioproject_accession": "PRJEB53055"},
        "base_entry": {
            "group_id": 1,
            "organism": "test_organism",
            "project_id": 0,
            "status": Status.SUBMITTED,
        },
        "add_function": add_to_project_table,
    }

    SAMPLE_CONFIG: Final = {
        "invalid_result": {"biosample_accession": "SAMEA999999999"},
        "valid_result": {"biosample_accession": "SAMEA7997453"},
        "base_entry": {
            "accession": "test_accession",
            "version": 1,
            "status": Status.SUBMITTED,
        },
        "add_function": add_to_sample_table,
    }

    NUCLEOTIDE_CONFIG: Final = {
        "invalid_result": {
            "insdc_accession_full_seg1": "XY999999",
            "insdc_accession_full_seg2": "XY999998",
        },
        "valid_result": {
            "insdc_accession_full_seg1": "OZ271453",
            "insdc_accession_full_seg2": "OZ271454",
        },
        "base_entry": {
            "accession": "test_accession",
            "version": 1,
            "status": Status.SUBMITTED,
        },
        "add_function": add_to_assembly_table,
    }

    GCA_CONFIG: Final = {
        "invalid_result": {"gca_accession": "GCA_999999999.1"},
        "valid_result": {"gca_accession": "GCA_965196905.1"},
        "base_entry": {
            "accession": "test_accession",
            "version": 1,
            "status": Status.SUBMITTED,
        },
        "add_function": add_to_assembly_table,
    }

    TEST_DATA: Final = {
        (EntityType.PROJECT, "ena_first_publicly_visible"): PROJECT_CONFIG,
        (EntityType.PROJECT, "ncbi_first_publicly_visible"): PROJECT_CONFIG,
        (EntityType.SAMPLE, "ena_first_publicly_visible"): SAMPLE_CONFIG,
        (EntityType.SAMPLE, "ncbi_first_publicly_visible"): SAMPLE_CONFIG,
        (EntityType.ASSEMBLY, "ena_nucleotide_first_publicly_visible"): NUCLEOTIDE_CONFIG,
        (EntityType.ASSEMBLY, "ncbi_nucleotide_first_publicly_visible"): NUCLEOTIDE_CONFIG,
        (EntityType.ASSEMBLY, "ena_gca_first_publicly_visible"): GCA_CONFIG,
        (EntityType.ASSEMBLY, "ncbi_gca_first_publicly_visible"): GCA_CONFIG,
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
        add_function = test_data["add_function"]
        entity_id = add_function(self.db_config, entry)
        if entity_id is None:
            msg = f"Failed to add {entity_type.value} entry to the database."
            raise ValueError(msg)

        # Build conditions dict for composite keys
        # add_to_project_table returns the project_id of that entry or None if the request failed,
        # the other add functions return True is add succeeded else false
        # Hence the 2 branches below
        if add_function == add_to_project_table:
            # Single key (like project_id)
            conditions = {"project_id": entity_id}
        else:
            conditions = asdict(entry.primary_key)

        # Run visibility check with invalid accessions
        check_and_update_visibility_for_column(
            self.config, self.db_config, entity_type, column_name
        )

        # Check that visibility column is None
        rows: list[dict] = find_conditions_in_db(
            self.db_config,
            config.table_name,
            conditions=conditions,
        )
        logger.debug(f"Rows found after invalid check: {rows}")
        assert len(rows) == 1, f"{entity_type.value} not found in table."

        entry_after_invalid = config.entry_class(**rows[0])
        visibility_value = getattr(entry_after_invalid, column_name)
        assert visibility_value is None, (
            f"{column_name} should be None for non-existing accessions. Got: {visibility_value}"
        )

        # Update the entry to have valid accessions
        update_db_where_conditions(
            self.db_config,
            config.table_name,
            conditions=conditions,
            update_values={"result": json.dumps(test_data["valid_result"])},
        )

        # Run the visibility check again with valid accessions
        check_and_update_visibility_for_column(
            self.config, self.db_config, entity_type, column_name
        )

        # Check that visibility column is now updated
        rows = find_conditions_in_db(
            self.db_config,
            config.table_name,
            conditions=conditions,
        )
        assert len(rows) == 1, f"{entity_type.value} not found in table after update."

        entry_after_valid = config.entry_class(**rows[0])
        visibility_value = getattr(entry_after_valid, column_name)
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
            self.db_config, self.config, mock_get_group_info, mock_submit_external_metadata
        )


class TestSingleSegmentOfMultiSegmentOrganismWithoutGCA(TestSubmission):
    @patch(
        "ena_deposition.upload_external_metadata_to_loculus.submit_external_metadata", autospec=True
    )
    @patch("ena_deposition.call_loculus.get_group_info", autospec=True)
    def test_submit(self, mock_get_group_info: Mock, mock_submit_external_metadata: Mock) -> None:
        multi_segment_submission(
            self.db_config,
            self.config,
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
            self.db_config,
            self.config,
            self.slack_config,
            last_retry_time=datetime.now(tz=pytz.utc),
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
    @patch(
        "ena_deposition.ena_submission_helper.update_with_retry",
        autospec=True,
    )
    @patch("ena_deposition.call_loculus.get_group_info", autospec=True)
    @patch("ena_deposition.notifications.notify", autospec=True)
    def test_submit(
        self, mock_notify: Mock, mock_get_group_info: Mock, mock_update_with_retry: Mock
    ) -> None:
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
        sample_table_handle_errors(
            self.db_config,
            self.config,
            self.slack_config,
            last_retry_time=datetime.now(tz=pytz.utc) - timedelta(hours=5),
        )
        msg = (
            f"{self.config.backend_url}: ENA Submission pipeline found 1 entries in sample_table "
            "in status HAS_ERRORS or SUBMITTING for over 0m"
        )
        mock_notify.assert_called_once_with(self.slack_config, msg)
        mock_update_with_retry.assert_called_once()


class TestRevisionAssemblyModificationTests(TestSubmission):
    @patch(
        "ena_deposition.upload_external_metadata_to_loculus.submit_external_metadata", autospec=True
    )
    @patch("ena_deposition.call_loculus.get_group_info", autospec=True)
    def test_revise(self, mock_get_group_info: Mock, mock_submit_external_metadata: Mock) -> None:
        self.config.set_alias_suffix = "revision" + str(uuid.uuid4())
        multi_segment_submission(
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
        multi_segment_submission(
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
        multi_segment_submission(
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
