import csv
import gzip
import json
import unittest
from pathlib import Path
from unittest import mock

import xmltodict
import yaml
from create_assembly import (
    create_chromosome_list,
    create_chromosome_list_object,
    create_fasta,
    create_manifest,
    create_manifest_object,
)
from create_project import construct_project_set_object
from create_sample import construct_sample_set_object
from ena_submission_helper import (
    ENAConfig,
    create_ena_project,
    create_ena_sample,
    dataclass_to_xml,
)
from ena_types import default_project_type, default_sample_type
from requests import exceptions

# Setup a mock configuration
test_config = ENAConfig(
    ena_submission_url="https://test.url",
    ena_reports_service_url="https://test.url",
    ena_submission_password="test_password",  # noqa: S106
    ena_submission_username="test_user",
)

# Test sample
loculus_sample: dict = json.load(
    open("test/approved_ena_submission_list_test.json", encoding="utf-8")
)

# Example XMLs
test_project_xml_response = Path("test/test_project_response.xml").read_text(encoding="utf-8")
text_project_xml_request = Path("test/text_project_request.xml").read_text(encoding="utf-8")
test_project_xml_failure_response = """
<RECEIPT receiptDate="2017-05-09T16:58:08.634+01:00" submissionFile="submission.xml" success="false">
</RECEIPT>
"""

test_sample_xml_request = Path("test/test_sample_request.xml").read_text(encoding="utf-8")
test_sample_xml_response = Path("test/test_sample_response.xml").read_text(encoding="utf-8")

# Default configs
with open("config/defaults.yaml", encoding="utf-8") as f:
    defaults = yaml.safe_load(f)


def mock_requests_post(status_code, text):
    mock_response = mock.Mock()
    mock_response.status_code = status_code
    mock_response.text = text
    return mock_response


class ProjectCreationTests(unittest.TestCase):
    @mock.patch("requests.post")
    def test_create_project_success(self, mock_post) -> None:
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
    def test_create_sample_success(self, mock_post):
        mock_post.return_value = mock_requests_post(200, test_sample_xml_response)
        sample_set = default_sample_type()
        response = create_ena_sample(test_config, sample_set)
        desired_response = {
            "sra_run_accession": "ERS1833148",
            "biosample_accession": "SAMEA104174130",
            "ena_submission_accession": "ERA979927",
        }
        assert response.results == desired_response

    @mock.patch("requests.post")
    def test_create_project_xml_failure(self, mock_post):
        # Testing project creation failure due to incorrect status
        mock_post.return_value = mock_requests_post(200, test_project_xml_failure_response)
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
        metadata_dict = {"taxon_id": "fake taxon", "scientific_name": "fake name"}
        config.organisms = {"fake organism": {"ingest": metadata_dict}}
        group_info = {"institution": "fake institution"}
        row = {"group_id": "1", "organism": "fake organism"}
        project_set = construct_project_set_object(group_info, config, row)
        assert xmltodict.parse(
            dataclass_to_xml(project_set, root_name="PROJECT_SET")
        ) == xmltodict.parse(text_project_xml_request)

    def test_sample_set_construction(self):
        organism_metadata = {}
        organism_metadata["scientific_name"] = "Test Scientific Name"
        organism_metadata["taxon_id"] = "Test taxon"
        center_name = "Fake center name"
        config = mock.Mock()
        config.metadata_mapping = defaults["metadata_mapping"]
        config.db_name = "Loculus"
        config.unique_project_suffix = "test suffix"
        config.organisms = {"test organism": {"ingest": organism_metadata}}
        row = {}
        organism = "test organism"
        row["accession"] = "test_accession"
        row["organism"] = organism
        sample_metadata = loculus_sample["LOC_0001TLY.1"]["metadata"]
        sample_data_in_submission_table = {
            "organism": organism,
            "metadata": sample_metadata,
            "center_name": center_name,
        }
        sample_set = construct_sample_set_object(
            config,
            sample_data_in_submission_table,
            row,
        )
        assert xmltodict.parse(
            dataclass_to_xml(sample_set, root_name="SAMPLE_SET")
        ) == xmltodict.parse(test_sample_xml_request)


class AssemblyCreationTests(unittest.TestCase):
    def test_create_files(self):
        unaligned_sequences = {
            "seg1": None,
            "seg2": "GCGGCACGTCAGTACGTAAGTGTATCTCAAAGAAATACTTAACTTTGAGAGAGTGAATT",
            "seg3": "CTTAACTTTGAGAGAGTGAATT",
        }
        seq_key = {"accession": "test_accession", "version": "test_version"}
        chromosome_list = create_chromosome_list_object(unaligned_sequences, seq_key)
        file_name_chromosome_list = create_chromosome_list(chromosome_list)
        fasta_file_name = create_fasta(unaligned_sequences, chromosome_list)

        # Check the file content
        with gzip.GzipFile(file_name_chromosome_list, "rb") as gz:
            content = gz.read()
        print(content)
        self.assertEqual(
            content,
            b"test_accession.test_version_seg2\tseg2\tlinear-segmented\ntest_accession.test_version_seg3\tseg3\tlinear-segmented\n",
        )

        with gzip.GzipFile(fasta_file_name, "rb") as gz:
            content = gz.read()
        print(content)
        self.assertEqual(
            content,
            b">test_accession.test_version_seg2\nGCGGCACGTCAGTACGTAAGTGTATCTCAAAGAAATACTTAACTTTGAGAGAGTGAATT\n>test_accession.test_version_seg3\nCTTAACTTTGAGAGAGTGAATT\n",
        )
        organism_metadata = {}
        organism_metadata["scientific_name"] = "Test Scientific Name"
        organism_metadata["taxon_id"] = "Test taxon"
        config = mock.Mock()
        config.db_name = "Loculus"
        config.unique_project_suffix = "test suffix"
        config.organisms = {"test organism": {"ingest": organism_metadata}}
        seq_key = {"accession": "test_accession", "version": "test_version"}
        organism = "test organism"
        group_key = {"group_id": 1, "organism": organism}
        organism = "test organism"
        study_accession = "Test Study Accession"
        sample_accession = "Test Sample Accession"
        sample_data_in_submission_table = {
            "organism": organism,
            "metadata": loculus_sample["LOC_0001TLY.1"]["metadata"],
            "unaligned_nucleotide_sequences": unaligned_sequences,
        }
        results_in_sample_table = {"result": {"sra_run_accession": sample_accession}}
        results_in_project_table = {"result": {"bioproject_accession": study_accession}}
        manifest = create_manifest_object(
            config,
            results_in_sample_table,
            results_in_project_table,
            sample_data_in_submission_table,
            seq_key,
            group_key,
        )
        manifest_file_name = create_manifest(manifest)
        data = {}
        with open(manifest_file_name, "r") as gz:
            reader = csv.reader(gz, delimiter="\t")
            for row in reader:
                if len(row) >= 2:  # Ensure the row has at least two elements
                    key = row[0]
                    value = row[1]
                    data[key] = value
        # Temp file names are different
        data.pop("CHROMOSOME_LIST")
        data.pop("FASTA")
        expected_data = {
            "STUDY": study_accession,
            "SAMPLE": sample_accession,
            "ASSEMBLYNAME": "test_accession",
            "ASSEMBLY_TYPE": "isolate",
            "COVERAGE": "1",
            "PROGRAM": "Unknown",
            "PLATFORM": "Illumina",
            "DESCRIPTION": "Original sequence submitted to Loculus with accession: test_accession, version: test_version",
        }

        self.assertEqual(data, expected_data)


if __name__ == "__main__":
    unittest.main()
