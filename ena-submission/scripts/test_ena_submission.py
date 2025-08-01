# ruff: noqa: S101

import csv
import gzip
import json
import logging
import unittest
from pathlib import Path
from typing import Any, Final
from unittest import mock

import xmltodict
import yaml
from ena_deposition.create_assembly import (
    create_chromosome_list_object,
    create_manifest_object,
)
from ena_deposition.create_project import construct_project_set_object
from ena_deposition.create_sample import construct_sample_set_object
from ena_deposition.ena_submission_helper import (
    create_chromosome_list,
    create_ena_project,
    create_ena_sample,
    create_fasta,
    create_manifest,
    dataclass_to_xml,
    get_chromsome_accessions,
    get_ena_analysis_process,
    get_sample_xml,
    reformat_authors_from_loculus_to_embl_style,
)
from ena_deposition.ena_types import (
    default_project_set,
    default_sample_set_type,
)
from ena_deposition.loculus_models import Group

logger = logging.getLogger(__name__)

TEST_GROUP: Final = Group._create_example_for_tests()


# Default configs
with open("config/defaults.yaml", encoding="utf-8") as f:
    defaults = yaml.safe_load(f)


def mock_config():
    config = mock.Mock()
    config.db_name = "Loculus"
    config.unique_project_suffix = "Test suffix"
    metadata_dict = {
        "taxon_id": "Test taxon",
        "scientific_name": "Test scientific name",
        "molecule_type": "genomic RNA",
    }
    config.organisms = {"Test organism": {"enaDeposition": metadata_dict}}
    config.metadata_mapping = defaults["metadata_mapping"]
    config.manifest_fields_mapping = defaults["manifest_fields_mapping"]
    config.ena_checklist = "ERC000033"
    config.set_alias_suffix = None
    config.is_broker = True
    config.ena_submission_url = "https://test.url"
    config.ena_reports_service_url = "https://test.url"
    config.ena_submission_password = "test_password"  # noqa: S105
    config.ena_submission_username = "test_user"
    config.ena_http_timeout_seconds = 10
    return config


MOCK_CONFIG: Final = mock_config()


# Example XMLs
test_project_xml_response = Path("test/test_project_response.xml").read_text(encoding="utf-8")
text_project_xml_request = Path("test/text_project_request.xml").read_text(encoding="utf-8")
test_project_xml_failure_response = (
    '<RECEIPT receiptDate="2017-05-09T16:58:08.634+01:00" submissionFile="submission.xml"'
    ' success="false">'
    "\n</RECEIPT>"
)

test_sample_xml_request = Path("test/test_sample_request.xml").read_text(encoding="utf-8")
test_sample_xml_request_gisaid = Path("test/test_sample_request_gisaid.xml").read_text(
    encoding="utf-8"
)
test_sample_xml_response = Path("test/test_sample_response.xml").read_text(encoding="utf-8")
revision_submission_xml_request = Path("test/test_revision_submission_request.xml").read_text(
    encoding="utf-8"
)
process_response_text = Path("test/get_ena_analysis_process_response.json").read_text(
    encoding="utf-8"
)


# Test sample
with open("test/approved_ena_submission_list_test.json", encoding="utf-8") as f:
    loculus_sample: dict = json.load(f)


def sample_data_in_submission_table() -> dict[str, Any]:
    """Returns a sample data structure that mimics the one used in the submission table."""
    return {
        "accession": "LOC_0001TLY",
        "version": "1",
        "group_id": 2,
        "organism": "Test organism",
        "metadata": loculus_sample["LOC_0001TLY.1"]["metadata"],
        "unaligned_nucleotide_sequences": {
            "seg1": None,
            "seg2": "GCGGCACGTCAGTACGTAAGTGTATCTCAAAGAAATACTTAACTTTGAGAGAGTGAATT",
            "seg3": "CTTAACTTTGAGAGAGTGAATT",
        },
        "center_name": "Fake center name",
    }


project_table_entry = {"group_id": "2", "organism": "Test organism"}
sample_table_entry = {
    "accession": "LOC_0001TLY",
    "version": "1",
}


# Mock requests
def mock_requests_post(status_code: int, text: str) -> mock.Mock:
    mock_response = mock.Mock()
    mock_response.status_code = status_code
    mock_response.text = text
    http_success_threshold: Final = 400
    mock_response.ok = mock_response.status_code < http_success_threshold
    return mock_response


class ProjectCreationTests(unittest.TestCase):
    @mock.patch("requests.post")
    def test_create_project_success(self, mock_post) -> None:
        # Testing successful project creation
        mock_post.return_value = mock_requests_post(200, test_project_xml_response)
        project_set = default_project_set()
        response = create_ena_project(MOCK_CONFIG, project_set)
        desired_response = {
            "bioproject_accession": "PRJEB20767",
            "ena_submission_accession": "ERA912529",
        }
        assert response.result == desired_response

    @mock.patch("requests.post")
    def test_create_project_xml_failure(self, mock_post):
        # Testing project creation failure due to incorrect status
        mock_post.return_value = mock_requests_post(200, test_project_xml_failure_response)
        project_set = default_project_set()
        with self.assertLogs("ena_deposition.ena_submission_helper", level="WARNING") as cm:
            response = create_ena_project(MOCK_CONFIG, project_set)
            self.assertIn("Response is in unexpected format", cm.output[0])
        error_message_part = "Response is in unexpected format"
        assert error_message_part in response.errors[0]

    @mock.patch("requests.post")
    def test_create_project_server_failure(self, mock_post):
        # Testing project creation failure
        mock_post.return_value = mock_requests_post(500, "Internal Server Error")
        project_set = default_project_set()
        with self.assertLogs("ena_deposition.ena_submission_helper", level="WARNING") as cm:
            response = create_ena_project(MOCK_CONFIG, project_set)
            self.assertIn("Request failed with status:500", cm.output[0])
        error_message_part = "Request failed with status:500"
        assert error_message_part in response.errors[0]
        error_message_part = "Response: Internal Server Error"
        assert error_message_part in response.errors[0]

    def test_construct_project_set_object(self):
        config = mock_config()
        project_set = construct_project_set_object(TEST_GROUP, config, project_table_entry)
        assert xmltodict.parse(
            dataclass_to_xml(project_set, root_name="PROJECT_SET")
        ) == xmltodict.parse(text_project_xml_request)


class TestCreateSample:
    @mock.patch("requests.post")
    def test_create_sample_success(self, mock_post):
        mock_post.return_value = mock_requests_post(200, test_sample_xml_response)
        sample_set = default_sample_set_type()
        response = create_ena_sample(MOCK_CONFIG, sample_set)
        desired_response = {
            "ena_sample_accession": "ERS1833148",
            "biosample_accession": "SAMEA104174130",
            "ena_submission_accession": "ERA979927",
        }
        assert response.result == desired_response

    def test_sample_set_construction(self):
        config = mock_config()
        sample_set = construct_sample_set_object(
            config,
            sample_data_in_submission_table(),
            sample_table_entry,
        )
        assert xmltodict.parse(
            dataclass_to_xml(sample_set, root_name="SAMPLE_SET")
        ) == xmltodict.parse(test_sample_xml_request)

    def test_sample_set_with_gisaid(self):
        config = mock_config()
        sample_data = sample_data_in_submission_table()
        sample_data["metadata"]["gisaidIsolateId"] = "EPI_ISL_12345"
        sample_set = construct_sample_set_object(
            config,
            sample_data,
            sample_table_entry,
        )
        assert xmltodict.parse(
            dataclass_to_xml(sample_set, root_name="SAMPLE_SET")
        ) == xmltodict.parse(test_sample_xml_request_gisaid)

    def test_sample_revision(self):
        config = mock_config()
        sample_set = construct_sample_set_object(
            config,
            sample_data_in_submission_table(),
            sample_table_entry,
        )
        files = get_sample_xml(sample_set, revision=True)
        revision = files["SUBMISSION"]
        assert xmltodict.parse(revision) == xmltodict.parse(revision_submission_xml_request)


class AssemblyCreationTests(unittest.TestCase):
    def setUp(self):
        self.unaligned_sequences_multi = sample_data_in_submission_table()[
            "unaligned_nucleotide_sequences"
        ]
        self.unaligned_sequences = {
            "main": "CTTAACTTTGAGAGAGTGAATT",
        }
        self.seq_key = {"accession": "LOC_0001TLY", "version": "1"}

    def test_format_authors(self):
        authors = "Xi,L.;Smith, Anna Maria; Perez Gonzalez, Anthony J.;Doe,;von Doe, John"
        result = reformat_authors_from_loculus_to_embl_style(authors)
        desired_result = "Xi L., Smith A.M., Perez Gonzalez A.J., Doe, von Doe J.;"
        self.assertEqual(result, desired_result)

    def test_create_chromosome_list_multi_segment(self):
        chromosome_list = create_chromosome_list_object(
            self.unaligned_sequences_multi, self.seq_key, {"topology": "circular"}
        )
        file_name_chromosome_list = create_chromosome_list(chromosome_list)

        with gzip.GzipFile(file_name_chromosome_list, "rb") as gz:
            content = gz.read()

        self.assertEqual(
            content,
            b"LOC_0001TLY_seg2\tseg2\tcircular-segmented\nLOC_0001TLY_seg3\tseg3\tcircular-segmented\n",
        )

    def test_create_chromosome_list(self):
        chromosome_list = create_chromosome_list_object(self.unaligned_sequences, self.seq_key, {})
        file_name_chromosome_list = create_chromosome_list(chromosome_list)

        with gzip.GzipFile(file_name_chromosome_list, "rb") as gz:
            content = gz.read()

        self.assertEqual(
            content,
            b"LOC_0001TLY\tgenome\tlinear-monopartite\n",
        )

    def test_create_fasta_multi(self):
        chromosome_list = create_chromosome_list_object(
            self.unaligned_sequences_multi, self.seq_key, {}
        )
        fasta_file_name = create_fasta(self.unaligned_sequences_multi, chromosome_list)

        with gzip.GzipFile(fasta_file_name, "rb") as gz:
            content = gz.read()
        self.assertEqual(
            content,
            b">LOC_0001TLY_seg2\nGCGGCACGTCAGTACGTAAGTGTATCTCAAAGAAATACTTAACTTTGAGAGAGTGAATT\n>LOC_0001TLY_seg3\nCTTAACTTTGAGAGAGTGAATT\n",
        )

    def test_create_fasta(self):
        chromosome_list = create_chromosome_list_object(self.unaligned_sequences, self.seq_key, {})
        fasta_file_name = create_fasta(self.unaligned_sequences, chromosome_list)

        with gzip.GzipFile(fasta_file_name, "rb") as gz:
            content = gz.read()
        self.assertEqual(
            content,
            b">LOC_0001TLY\nCTTAACTTTGAGAGAGTGAATT\n",
        )

    @mock.patch("ena_deposition.call_loculus.get_group_info")
    def test_create_manifest(self, mock_get_group_info):
        config = mock_config()
        study_accession = "Test Study Accession"
        sample_accession = "Test Sample Accession"
        mock_get_group_info.return_value = TEST_GROUP
        manifest = create_manifest_object(
            config,
            sample_accession,
            study_accession,
            sample_data_in_submission_table(),
        )
        manifest_file_name = create_manifest(manifest, is_broker=True)
        data = {}
        with open(manifest_file_name, encoding="utf-8") as gz:
            reader = csv.reader(gz, delimiter="\t")
            for row in reader:
                try:
                    key = row[0]
                    value = row[1]
                    data[key] = value
                except IndexError as e:
                    msg = (
                        f"Error reading manifest file: {manifest_file_name}. "
                        f"Row does not have enough elements: {row}"
                    )
                    raise ValueError(msg) from e
        # Temp file names are different
        data.pop("CHROMOSOME_LIST")
        data.pop("FLATFILE")
        expected_data = {
            "STUDY": study_accession,
            "SAMPLE": sample_accession,
            "ADDRESS": "Fake center name, Basel, BS, Switzerland",
            "ASSEMBLYNAME": "LOC_0001TLY.1",
            "ASSEMBLY_TYPE": "isolate",
            "AUTHORS": "M. Ammar M.S.;",
            "COVERAGE": "1",
            "PROGRAM": "Ivar",
            "PLATFORM": "Illumina",
            "DESCRIPTION": (
                "Original sequence submitted to Loculus with accession: LOC_0001TLY, version: 1"
            ),
            "MOLECULETYPE": "genomic RNA",
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
        with (
            self.assertRaises(ValueError),
            self.assertLogs("ena_deposition.ena_submission_helper", level="ERROR"),
        ):
            get_chromsome_accessions(insdc_accession_range, segment_order)

        insdc_accession_range = "OZ189935-TK189936"
        segment_order = ["A", "B"]
        with (
            self.assertRaises(ValueError),
            self.assertLogs("ena_deposition.ena_submission_helper", level="ERROR"),
        ):
            get_chromsome_accessions(insdc_accession_range, segment_order)

    @mock.patch("requests.get")
    def test_get_ena_analysis_process(self, mock_post):
        mock_post.return_value = mock_requests_post(200, process_response_text)
        response = get_ena_analysis_process(
            MOCK_CONFIG, erz_accession="ERZ000001", segment_order=["main"]
        )
        desired_response = {
            "erz_accession": "ERZ000001",
            "insdc_accession": "OZ189999",
            "insdc_accession_full": "OZ189999.1",
            "segment_order": ["main"],
        }
        self.assertEqual(response.result, desired_response)


if __name__ == "__main__":
    import pytest

    pytest.main([__file__])
