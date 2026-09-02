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
import logging
import re
import uuid
from datetime import datetime, timedelta
from itertools import chain, repeat
from typing import Final
from unittest.mock import Mock, patch

import pytest
import pytz
from ena_deposition.config import Config
from ena_deposition.create_project import (
    create_project_iter,
    project_table_create,
)
from ena_deposition.create_project import (
    sync_state_with_submission_table as create_project_sync_state_with_submission_table,
)
from ena_deposition.create_sample import (
    create_sample_iter,
    sample_table_create,
)
from ena_deposition.create_sample import (
    sync_state_with_submission_table as create_sample_sync_state_with_submission_table,
)
from ena_deposition.loculus_models import Group
from ena_deposition.notifications import SlackConfig
from ena_deposition.trigger_submission_to_ena import upload_sequences
from ena_deposition.upload_external_metadata_to_loculus import (
    get_external_metadata_and_send_to_loculus,
)
from helpers import (
    SubmissionTestBase,
    assert_assembly_submission_errored,
    assert_successful_assembly_submission,
    assert_successful_assembly_submission_no_wait,
    assert_successful_project_submission,
    assert_successful_sample_submission,
    check_project_submission_has_errors,
    check_project_submission_started,
    check_sample_submission_has_errors,
    check_sample_submission_started,
    check_sent_to_loculus,
    check_sequences_uploaded,
    get_revisions,
    get_sequences,
)
from sqlalchemy import Engine

logger = logging.getLogger(__name__)

TEST_GROUP: Final = Group._create_example_for_tests()


def mock_requests_post() -> Mock:
    mock_response = Mock()
    mock_response.status_code = 204
    mock_response.ok = True
    return mock_response


def multi_segment_submission(
    db_engine: Engine,
    config: Config,
    slack_config: SlackConfig,
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

    get_external_metadata_and_send_to_loculus(db_engine, config)
    mock_submit_external_metadata.assert_not_called()

    upload_sequences(db_engine, sequences_to_upload)
    check_sequences_uploaded(db_engine, sequences_to_upload)
    get_external_metadata_and_send_to_loculus(db_engine, config)
    mock_submit_external_metadata.assert_not_called()

    assert_successful_project_submission(db_engine, config, slack_config, sequences_to_upload)
    get_external_metadata_and_send_to_loculus(db_engine, config)
    args = mock_submit_external_metadata.call_args_list

    assert len(args) == 1
    payload = args[0][0][0]  # first positional argument of first call
    assert payload["accession"] == "LOC_0001TLY"
    assert payload["version"] == 1
    assert set(payload["externalMetadata"]) == {"bioprojectAccession"}
    assert payload["externalMetadata"]["bioprojectAccession"].startswith("PRJEB")

    assert_successful_sample_submission(db_engine, config, slack_config, sequences_to_upload)
    get_external_metadata_and_send_to_loculus(db_engine, config)
    args = mock_submit_external_metadata.call_args_list
    assert len(args) == 2  # noqa: PLR2004
    payload = args[1][0][0]  # first positional argument of second call
    assert payload["accession"] == "LOC_0001TLY"
    assert payload["version"] == 1
    assert set(payload["externalMetadata"]) == {"bioprojectAccession", "biosampleAccession"}
    assert payload["externalMetadata"]["bioprojectAccession"].startswith("PRJEB")
    assert payload["externalMetadata"]["biosampleAccession"].startswith("SAMEA")

    assert_successful_assembly_submission(db_engine, config, sequences_to_upload, single_segment)
    get_external_metadata_and_send_to_loculus(db_engine, config)
    if not single_segment:
        # Only complete in case of multi-segment submission
        check_sent_to_loculus(db_engine, sequences_to_upload)
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


class TestSimpleSubmission(SubmissionTestBase):
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


class TestSingleSegmentOfMultiSegmentOrganismWithoutGCA(SubmissionTestBase):
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


class TestKnownBioproject(SubmissionTestBase):
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
        upload_sequences(self.db_engine, sequences_to_upload)
        check_sequences_uploaded(self.db_engine, sequences_to_upload)

        # submit
        assert_successful_project_submission(
            self.db_engine, self.config, self.slack_config, sequences_to_upload
        )
        assert_successful_sample_submission(
            self.db_engine, self.config, self.slack_config, sequences_to_upload
        )
        assert_successful_assembly_submission(self.db_engine, self.config, sequences_to_upload)

        # send to loculus
        get_external_metadata_and_send_to_loculus(self.db_engine, self.config)
        check_sent_to_loculus(self.db_engine, sequences_to_upload)


class TestIncorrectBioprojectPassed(SubmissionTestBase):
    @patch("ena_deposition.notifications.notify", autospec=True)
    @patch("ena_deposition.call_loculus.get_group_info", autospec=True)
    def test_submit(self, mock_get_group_info: Mock, mock_notify: Mock) -> None:
        """
        Test submitting sequences with an incorrect bioproject - this should fail
        """
        # get data
        mock_get_group_info.return_value = TEST_GROUP
        mock_notify.return_value = None
        self.config.submitting_time_threshold_min = 360
        sequences_to_upload = get_sequences()
        for entry in sequences_to_upload.values():  # set to invalid bioproject
            entry["metadata"]["bioprojectAccession"] = "INVALID_ACCESSION"

        # upload sequences
        upload_sequences(self.db_engine, sequences_to_upload)
        check_sequences_uploaded(self.db_engine, sequences_to_upload)

        # check project submission fails
        create_project_sync_state_with_submission_table(self.db_engine)
        project_table_create(self.db_engine, self.config)
        check_project_submission_has_errors(self.db_engine, self.config, sequences_to_upload)

        # Confirm error submission sends notification, DB entry is reset to READY to retry
        last_retry_time = create_project_iter(
            self.db_engine,
            self.config,
            self.slack_config,
            last_retry_time=datetime.now(tz=pytz.utc)
            - timedelta(minutes=self.config.submitting_time_threshold_min + 1),
        )
        check_project_submission_started(self.db_engine, sequences_to_upload)
        msg = (
            f"{self.config.backend_url}: ENA Submission pipeline found 1 entries in project_table "
            "in status HAS_ERRORS or SUBMITTING for over "
            f"{self.config.submitting_time_threshold_min}m"
        )
        mock_notify.assert_called_once_with(self.slack_config, msg)

        # Confirm DB entry is still in error state after retrying submission
        create_project_iter(
            self.db_engine, self.config, self.slack_config, last_retry_time=last_retry_time
        )
        check_project_submission_has_errors(self.db_engine, self.config, sequences_to_upload)


class TestKnownBioprojectAndBioSample(SubmissionTestBase):
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
        upload_sequences(self.db_engine, sequences_to_upload)
        check_sequences_uploaded(self.db_engine, sequences_to_upload)

        # submit
        assert_successful_project_submission(
            self.db_engine, self.config, self.slack_config, sequences_to_upload
        )
        assert_successful_sample_submission(
            self.db_engine, self.config, self.slack_config, sequences_to_upload
        )
        assert_successful_assembly_submission(self.db_engine, self.config, sequences_to_upload)

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

        sequences_to_upload = get_sequences()
        for entry in sequences_to_upload.values():  # set to public bioproject and biosample
            entry["metadata"]["bioprojectAccession"] = "PRJNA231221"
            entry["metadata"]["biosampleAccession"] = "SAMN11077987"

        # upload
        upload_sequences(self.db_engine, sequences_to_upload)
        check_sequences_uploaded(self.db_engine, sequences_to_upload)

        # check project submission fails
        create_project_sync_state_with_submission_table(self.db_engine)
        project_table_create(self.db_engine, self.config)
        check_project_submission_has_errors(self.db_engine, self.config, sequences_to_upload)

        # Confirm DB entry is reset to READY to retry submission
        create_project_iter(
            self.db_engine,
            self.config,
            self.slack_config,
            last_retry_time=datetime.now(tz=pytz.utc) - timedelta(hours=5),
        )
        check_project_submission_started(self.db_engine, sequences_to_upload)

        # submit
        assert_successful_project_submission(
            self.db_engine, self.config, self.slack_config, sequences_to_upload
        )
        assert_successful_sample_submission(
            self.db_engine, self.config, self.slack_config, sequences_to_upload
        )
        assert_successful_assembly_submission(self.db_engine, self.config, sequences_to_upload)

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
        self.config.submitting_time_threshold_min = 360
        mock_submit_external_metadata.return_value = mock_requests_post()
        mock_accession_exists.side_effect = chain([False], repeat(True))
        mock_notify.return_value = None

        sequences_to_upload = get_sequences()
        for entry in sequences_to_upload.values():  # set to public bioproject and biosample
            entry["metadata"]["bioprojectAccession"] = "PRJNA231221"
            entry["metadata"]["biosampleAccession"] = "SAMN11077987"

        # upload
        upload_sequences(self.db_engine, sequences_to_upload)
        check_sequences_uploaded(self.db_engine, sequences_to_upload)

        # submit
        assert_successful_project_submission(
            self.db_engine, self.config, self.slack_config, sequences_to_upload
        )

        # check sample submission fails and sends notification
        create_sample_sync_state_with_submission_table(self.db_engine)
        sample_table_create(self.db_engine, self.config)
        check_sample_submission_has_errors(self.db_engine, sequences_to_upload)

        # Confirm DB entry is reset to READY to retry submission
        create_sample_iter(
            self.db_engine,
            self.config,
            self.slack_config,
            last_retry_time=datetime.now(tz=pytz.utc)
            - timedelta(minutes=self.config.submitting_time_threshold_min + 1),
        )
        check_sample_submission_started(self.db_engine, sequences_to_upload)
        msg = (
            f"{self.config.backend_url}: ENA Submission pipeline found 1 entries in sample_table in"
            " status HAS_ERRORS or SUBMITTING for over "
            f"{self.config.submitting_time_threshold_min}m"
        )
        mock_notify.assert_called_once_with(self.slack_config, msg)

        assert_successful_sample_submission(
            self.db_engine, self.config, self.slack_config, sequences_to_upload
        )
        assert_successful_assembly_submission(self.db_engine, self.config, sequences_to_upload)

        # send to loculus
        get_external_metadata_and_send_to_loculus(self.db_engine, self.config)
        check_sent_to_loculus(self.db_engine, sequences_to_upload)


class TestKnownBioprojectAndIncorrectBioSample(SubmissionTestBase):
    @patch("ena_deposition.call_loculus.get_group_info", autospec=True)
    @patch("ena_deposition.notifications.notify", autospec=True)
    def test_submit(self, mock_notify: Mock, mock_get_group_info: Mock) -> None:
        """
        Test submitting sequences with known public bioproject and invalid biosample
        """
        # get data
        mock_get_group_info.return_value = TEST_GROUP
        mock_notify.return_value = None
        self.config.submitting_time_threshold_min = 360
        sequences_to_upload = get_sequences()
        for entry in sequences_to_upload.values():  # set to invalid biosample
            entry["metadata"]["bioprojectAccession"] = "PRJNA231221"
            entry["metadata"]["biosampleAccession"] = "INVALID_ACCESSION"

        # upload
        upload_sequences(self.db_engine, sequences_to_upload)
        check_sequences_uploaded(self.db_engine, sequences_to_upload)

        # submit project
        assert_successful_project_submission(
            self.db_engine, self.config, self.slack_config, sequences_to_upload
        )

        # check sample submission fails and sends notification
        create_sample_sync_state_with_submission_table(self.db_engine)
        sample_table_create(self.db_engine, self.config)
        check_sample_submission_has_errors(self.db_engine, sequences_to_upload)

        # Confirm DB entry is reset to READY to retry submission
        create_sample_iter(
            self.db_engine,
            self.config,
            self.slack_config,
            last_retry_time=datetime.now(tz=pytz.utc)
            - timedelta(minutes=self.config.submitting_time_threshold_min + 1),
        )
        check_sample_submission_started(self.db_engine, sequences_to_upload)
        msg = (
            f"{self.config.backend_url}: ENA Submission pipeline found 1 entries in sample_table in"
            " status HAS_ERRORS or SUBMITTING for over "
            f"{self.config.submitting_time_threshold_min}m"
        )
        mock_notify.assert_called_once_with(self.slack_config, msg)

        # Confirm DB entry is still in error state after retrying submission
        create_project_sync_state_with_submission_table(self.db_engine)
        sample_table_create(self.db_engine, self.config)
        check_sample_submission_has_errors(self.db_engine, sequences_to_upload)


class TestRevisionAssemblyModificationTests(SubmissionTestBase):
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
            modify_assembly=modify_assembly, modify_manifest=modify_manifest
        )

        # upload sequences
        upload_sequences(self.db_engine, sequences_to_upload)
        check_sequences_uploaded(self.db_engine, sequences_to_upload)

        # submit
        assert_successful_project_submission(
            self.db_engine, self.config, self.slack_config, sequences_to_upload
        )
        assert_successful_sample_submission(
            self.db_engine, self.config, self.slack_config, sequences_to_upload
        )
        assert_successful_assembly_submission(self.db_engine, self.config, sequences_to_upload)

        # send to loculus
        get_external_metadata_and_send_to_loculus(self.db_engine, self.config)
        check_sent_to_loculus(self.db_engine, sequences_to_upload)


class TestRevisionNoAssemblyModificationTests(SubmissionTestBase):
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
        sequences_to_upload = get_revisions(modify_assembly=False)

        # upload sequences
        upload_sequences(self.db_engine, sequences_to_upload)
        check_sequences_uploaded(self.db_engine, sequences_to_upload)

        # submit
        assert_successful_project_submission(
            self.db_engine, self.config, self.slack_config, sequences_to_upload
        )
        assert_successful_sample_submission(
            self.db_engine, self.config, self.slack_config, sequences_to_upload
        )
        assert_successful_assembly_submission_no_wait(
            self.db_engine, self.config, self.slack_config, sequences_to_upload
        )

        # send to loculus
        get_external_metadata_and_send_to_loculus(self.db_engine, self.config)
        check_sent_to_loculus(self.db_engine, sequences_to_upload)


class TestRevisionWithManifestChangeTests(SubmissionTestBase):
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
        sequences_to_upload = get_revisions(modify_manifest=True)

        # upload sequences
        upload_sequences(self.db_engine, sequences_to_upload)
        check_sequences_uploaded(self.db_engine, sequences_to_upload)

        # submit
        assert_successful_project_submission(
            self.db_engine, self.config, self.slack_config, sequences_to_upload
        )
        assert_successful_sample_submission(
            self.db_engine, self.config, self.slack_config, sequences_to_upload
        )

        # check notified cannot submit assembly
        assert_assembly_submission_errored(
            self.db_engine, self.config, self.slack_config, sequences_to_upload, mock_notify
        )


if __name__ == "__main__":
    import pytest

    pytest.main([__file__])
