import csv
import gzip
import json
import unittest
from pathlib import Path
from unittest import mock

import requests
import xmltodict
import yaml
from create_assembly import (
    create_chromosome_list_object,
    create_manifest_object,
)
from create_project import construct_project_set_object
from create_sample import construct_sample_set_object
from ena_submission_helper import (
    ENAConfig,
    create_chromosome_list,
    create_ena_project,
    create_ena_sample,
    create_fasta,
    create_manifest,
    dataclass_to_xml,
    get_chromsome_accessions,
    get_ena_analysis_process,
)
from ena_types import default_project_type, default_sample_type

# Default configs
with open("config/defaults.yaml", encoding="utf-8") as f:
    defaults = yaml.safe_load(f)

# Setup a mock configuration
test_ena_config = ENAConfig(
    ena_submission_url="https://test.url",
    ena_reports_service_url="https://test.url",
    ena_submission_password="test_password",  # noqa: S106
    ena_submission_username="test_user",
)


def mock_config():
    config = mock.Mock()
    config.db_name = "Loculus"
    config.unique_project_suffix = "Test suffix"
    metadata_dict = {"taxon_id": "Test taxon", "scientific_name": "Test scientific name"}
    config.organisms = {"Test organism": {"ingest": metadata_dict}}
    config.metadata_mapping = defaults["metadata_mapping"]
    config.metadata_mapping_mandatory_field_defaults = defaults[
        "metadata_mapping_mandatory_field_defaults"
    ]
    config.ena_checklist = "ERC000033"
    return config


# Example XMLs
test_project_xml_response = Path("test/test_project_response.xml").read_text(encoding="utf-8")
text_project_xml_request = Path("test/text_project_request.xml").read_text(encoding="utf-8")
test_project_xml_failure_response = """
<RECEIPT receiptDate="2017-05-09T16:58:08.634+01:00" submissionFile="submission.xml" success="false">
</RECEIPT>
"""

test_sample_xml_request = Path("test/test_sample_request.xml").read_text(encoding="utf-8")
test_sample_xml_response = Path("test/test_sample_response.xml").read_text(encoding="utf-8")
process_response_text = Path("test/get_ena_analysis_process_response.json").read_text(
    encoding="utf-8"
)


# Test sample
loculus_sample: dict = json.load(
    open("test/approved_ena_submission_list_test.json", encoding="utf-8")
)
sample_data_in_submission_table = {
    "accession": "test_accession",
    "version": "test_version",
    "group_id": 1,
    "organism": "Test organism",
    "metadata": loculus_sample["LOC_0001TLY.1"]["metadata"],
    "unaligned_nucleotide_sequences": {
        "seg1": None,
        "seg2": "GCGGCACGTCAGTACGTAAGTGTATCTCAAAGAAATACTTAACTTTGAGAGAGTGAATT",
        "seg3": "CTTAACTTTGAGAGAGTGAATT",
    },
    "center_name": "Fake center name",
}
project_table_entry = {"group_id": "1", "organism": "Test organism"}
sample_table_entry = {
    "accession": "test_accession",
    "version": "test_version",
}


# Mock requests
def mock_requests_post(status_code, text):
    mock_response = mock.Mock()
    mock_response.status_code = status_code
    mock_response.text = text
    mock_response.ok = mock_response.status_code < 400
    return mock_response


class ProjectCreationTests(unittest.TestCase):
    @mock.patch("requests.post")
    def test_create_project_success(self, mock_post) -> None:
        # Testing successful project creation
        mock_post.return_value = mock_requests_post(200, test_project_xml_response)
        project_set = default_project_type()
        response = create_ena_project(test_ena_config, project_set)
        desired_response = {
            "bioproject_accession": "PRJEB20767",
            "ena_submission_accession": "ERA912529",
        }
        self.assertEqual(response.results, desired_response)

    @mock.patch("requests.post")
    def test_create_project_xml_failure(self, mock_post):
        # Testing project creation failure due to incorrect status
        mock_post.return_value = mock_requests_post(200, test_project_xml_failure_response)
        project_set = default_project_type()
        response = create_ena_project(test_ena_config, project_set)
        error_message_part = "Response is in unexpected format"
        self.assertIn(error_message_part, response.errors[0])

    @mock.patch("requests.post")
    def test_create_project_server_failure(self, mock_post):
        # Testing project creation failure
        mock_post.return_value = mock_requests_post(500, "Internal Server Error")
        project_set = default_project_type()
        response = create_ena_project(test_ena_config, project_set)
        error_message_part = "Request failed with status:500"
        self.assertIn(error_message_part, response.errors[0])
        error_message_part = "Response: Internal Server Error"
        self.assertIn(error_message_part, response.errors[0])

    def test_construct_project_set_object(self):
        config = mock_config()
        group_info = {"institution": "Test institution"}
        project_set = construct_project_set_object(group_info, config, project_table_entry)
        self.assertEqual(
            xmltodict.parse(dataclass_to_xml(project_set, root_name="PROJECT_SET")),
            xmltodict.parse(text_project_xml_request),
        )


class SampleCreationTests(unittest.TestCase):
    @mock.patch("requests.post")
    def test_create_sample_success(self, mock_post):
        mock_post.return_value = mock_requests_post(200, test_sample_xml_response)
        sample_set = default_sample_type()
        response = create_ena_sample(test_ena_config, sample_set)
        desired_response = {
            "ena_sample_accession": "ERS1833148",
            "biosample_accession": "SAMEA104174130",
            "ena_submission_accession": "ERA979927",
        }
        self.assertEqual(response.results, desired_response)

    def test_sample_set_construction(self):
        config = mock_config()
        sample_set = construct_sample_set_object(
            config,
            sample_data_in_submission_table,
            sample_table_entry,
        )
        self.assertEqual(
            xmltodict.parse(dataclass_to_xml(sample_set, root_name="SAMPLE_SET")),
            xmltodict.parse(test_sample_xml_request),
        )


class AssemblyCreationTests(unittest.TestCase):
    def setUp(self):
        self.unaligned_sequences_multi = sample_data_in_submission_table[
            "unaligned_nucleotide_sequences"
        ]
        self.unaligned_sequences = {
            "main": "CTTAACTTTGAGAGAGTGAATT",
        }
        self.seq_key = {"accession": "test_accession", "version": "test_version"}

    def test_create_chromosome_list_multi_segment(self):
        chromosome_list = create_chromosome_list_object(
            self.unaligned_sequences_multi, self.seq_key
        )
        file_name_chromosome_list = create_chromosome_list(chromosome_list)

        with gzip.GzipFile(file_name_chromosome_list, "rb") as gz:
            content = gz.read()

        self.assertEqual(
            content,
            b"test_accession.test_version_seg2\tseg2\tlinear-segmented\ntest_accession.test_version_seg3\tseg3\tlinear-segmented\n",
        )

    def test_create_chromosome_list(self):
        chromosome_list = create_chromosome_list_object(self.unaligned_sequences, self.seq_key)
        file_name_chromosome_list = create_chromosome_list(chromosome_list)

        with gzip.GzipFile(file_name_chromosome_list, "rb") as gz:
            content = gz.read()

        self.assertEqual(
            content,
            b"test_accession.test_version\tmain\tlinear-segmented\n",
        )

    def test_create_fasta_multi(self):
        chromosome_list = create_chromosome_list_object(
            self.unaligned_sequences_multi, self.seq_key
        )
        fasta_file_name = create_fasta(self.unaligned_sequences_multi, chromosome_list)

        with gzip.GzipFile(fasta_file_name, "rb") as gz:
            content = gz.read()
        self.assertEqual(
            content,
            b">test_accession.test_version_seg2\nGCGGCACGTCAGTACGTAAGTGTATCTCAAAGAAATACTTAACTTTGAGAGAGTGAATT\n>test_accession.test_version_seg3\nCTTAACTTTGAGAGAGTGAATT\n",
        )

    def test_create_fasta(self):
        chromosome_list = create_chromosome_list_object(self.unaligned_sequences, self.seq_key)
        fasta_file_name = create_fasta(self.unaligned_sequences, chromosome_list)

        with gzip.GzipFile(fasta_file_name, "rb") as gz:
            content = gz.read()
        self.assertEqual(
            content,
            b">test_accession.test_version\nCTTAACTTTGAGAGAGTGAATT\n",
        )

    def test_create_manifest(self):
        config = mock_config()
        group_key = {"group_id": 1, "organism": "Test organism"}
        study_accession = "Test Study Accession"
        sample_accession = "Test Sample Accession"
        results_in_sample_table = {"result": {"ena_sample_accession": sample_accession}}
        results_in_project_table = {"result": {"bioproject_accession": study_accession}}
        manifest = create_manifest_object(
            config,
            results_in_sample_table,
            results_in_project_table,
            sample_data_in_submission_table,
            self.seq_key,
            group_key,
        )
        manifest_file_name = create_manifest(manifest)
        data = {}
        with open(manifest_file_name, encoding="utf-8") as gz:
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

    def test_get_chromsome_accessions(self):
        insdc_accession_range = "OZ189935-OZ189936"
        segment_order = ["seg2", "seg3"]
        result_multi = get_chromsome_accessions(insdc_accession_range, segment_order)
        self.assertEqual(
            result_multi,
            {
                "insdc_accession_seg2": "OZ189935",
                "insdc_accession_seg3": "OZ189936",
                "insdc_accession_full_seg2": "OZ189935.1",
                "insdc_accession_full_seg3": "OZ189936.1",
            },
        )
        insdc_accession_range = "OZ189935-OZ189935"
        segment_order = ["main"]
        result_single = get_chromsome_accessions(insdc_accession_range, segment_order)
        self.assertEqual(
            result_single,
            {
                "insdc_accession": "OZ189935",
                "insdc_accession_full": "OZ189935.1",
            },
        )
        insdc_accession_range = "OZ189935-OZ189935"
        segment_order = ["seg3"]
        result_single = get_chromsome_accessions(insdc_accession_range, segment_order)
        self.assertEqual(
            result_single,
            {
                "insdc_accession_seg3": "OZ189935",
                "insdc_accession_full_seg3": "OZ189935.1",
            },
        )
        insdc_accession_range = "OZ189935-OZ189936"
        segment_order = ["main"]
        with self.assertRaises(requests.exceptions.RequestException):
            get_chromsome_accessions(insdc_accession_range, segment_order)

    @mock.patch("requests.get")
    def test_get_ena_analysis_process(self, mock_post):
        mock_post.return_value = mock_requests_post(200, process_response_text)
        response = get_ena_analysis_process(
            test_ena_config, erz_accession="ERZ000001", segment_order=["main"]
        )
        desired_response = {
            "erz_accession": "ERZ000001",
            "insdc_accession": "OZ189999",
            "insdc_accession_full": "OZ189999.1",
            "segment_order": ["main"],
        }
        self.assertEqual(response.results, desired_response)


if __name__ == "__main__":
    unittest.main()
