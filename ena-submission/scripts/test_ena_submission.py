import unittest
from unittest import mock

import xmltodict
from create_project import construct_project_set_object
from ena_submission_helper import ENAConfig, create_ena_project, dataclass_to_xml
from ena_types import default_project_type
from requests import exceptions

# Setup a mock configuration
test_config = ENAConfig(
    ena_submission_url="https://test.url",
    ena_submission_password="test_password",
    ena_submission_username="test_user",
)

# Example XML responses
test_project_xml_response = """
<RECEIPT receiptDate="2017-05-09T16:58:08.634+01:00" submissionFile="submission.xml" success="true">
<PROJECT accession="PRJEB20767" alias="cheddar_cheese" status="PRIVATE" />
<SUBMISSION accession="ERA912529" alias="cheese" />
<MESSAGES>
    <INFO>This submission is a TEST submission and will be discarded within 24 hours</INFO>
</MESSAGES>
<ACTIONS>ADD</ACTIONS>
</RECEIPT>
"""

text_project_xml_request = """
<PROJECT_SET>
    <PROJECT center_name="fake institution" alias="1:fake organism:test suffix">
        <NAME>fake name</NAME>
        <TITLE>fake name: Genome sequencing</TITLE>
        <DESCRIPTION>Automated upload of fake name sequences submitted by fake institution from Loculus</DESCRIPTION>
        <SUBMISSION_PROJECT>
            <SEQUENCING_PROJECT/>
            <ORGANISM>
            <TAXON_ID>fake taxon</TAXON_ID>
            <SCIENTIFIC_NAME>fake name</SCIENTIFIC_NAME>
            </ORGANISM>
        </SUBMISSION_PROJECT>
        <PROJECT_LINKS>
            <PROJECT_LINK>
                <XREF_LINK>
                <DB>Loculus</DB>
                <ID>1</ID>
                </XREF_LINK>
            </PROJECT_LINK>
        </PROJECT_LINKS>
    </PROJECT>
</PROJECT_SET>
"""

test_xml_failure_response = """
<RECEIPT receiptDate="2017-05-09T16:58:08.634+01:00" submissionFile="submission.xml" success="false">
</RECEIPT>
"""


def mock_requests_post(status_code, text):
    mock_response = mock.Mock()
    mock_response.status_code = status_code
    mock_response.text = text
    return mock_response


class ProjectCreationTests(unittest.TestCase):
    @mock.patch("requests.post")
    def test_create_project_success(self, mock_post):
        # Testing successful project creation
        mock_post.return_value = mock_requests_post(200, test_project_xml_response)
        project_set = default_project_type()
        response = create_ena_project(test_config, project_set)
        desired_response = {
            "bioproject_accession": "PRJEB20767",
            "ena_submission_accession": "ERA912529",
        }
        assert response.results == desired_response

    @mock.patch("requests.post")
    def test_create_project_xml_failure(self, mock_post):
        # Testing project creation failure due to incorrect status
        mock_post.return_value = mock_requests_post(200, test_xml_failure_response)
        project_set = default_project_type()
        response = create_ena_project(test_config, project_set)
        error_message_part = "Response is in unexpected format"
        self.assertIn(error_message_part, response.errors[0])

    @mock.patch("requests.post")
    def test_create_project_server_failure(self, mock_post):
        # Testing project creation failure
        mock_post.return_value = mock_requests_post(500, "Internal Server Error")
        mock_post.return_value.raise_for_status.side_effect = exceptions.RequestException()
        project_set = default_project_type()
        response = create_ena_project(test_config, project_set)
        error_message_part = "Request failed with status:500"
        self.assertIn(error_message_part, response.errors[0])
        error_message_part = "Response: Internal Server Error"
        self.assertIn(error_message_part, response.errors[0])

    def test_construct_project_set_object(self):
        config = mock.Mock()
        config.db_name = "Loculus"
        config.unique_project_suffix = "test suffix"
        group_info = {"institution": "fake institution"}
        metadata_dict = {"taxon_id": "fake taxon", "scientific_name": "fake name"}
        row = {"group_id": "1", "organism": "fake organism"}
        project_set = construct_project_set_object(group_info, config, metadata_dict, row)
        assert xmltodict.parse(
            dataclass_to_xml(project_set, root_name="PROJECT_SET")
        ) == xmltodict.parse(text_project_xml_request)


if __name__ == "__main__":
    unittest.main()
