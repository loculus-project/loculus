import unittest
from unittest import mock

import xmltodict
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

test_project_xml_failure_response = """
<RECEIPT receiptDate="2017-05-09T16:58:08.634+01:00" submissionFile="submission.xml" success="false">
</RECEIPT>
"""

test_sample_xml_request = """
<SAMPLE_SET>
        <SAMPLE center_name="Fake center name" alias="test_accession:test organism:test suffix">
                <TITLE>Test Scientific Name: Genome sequencing</TITLE>
                <SAMPLE_NAME>
                        <TAXON_ID>Test taxon</TAXON_ID>
                        <SCIENTIFIC_NAME>Test Scientific Name</SCIENTIFIC_NAME>
                </SAMPLE_NAME>
                <DESCRIPTION>Automated upload of Test Scientific Name sequences submitted by Fake center name from Loculus</DESCRIPTION>
                <SAMPLE_LINKS>
                        <SAMPLE_LINK>
                                <XREF_LINK>
                                        <DB>Loculus</DB>
                                        <ID>test_accession</ID>
                                </XREF_LINK>
                        </SAMPLE_LINK>
                </SAMPLE_LINKS>
                <SAMPLE_ATTRIBUTES>
                        <SAMPLE_ATTRIBUTE>
                                <TAG>hospitalisation</TAG>
                                <VALUE>true</VALUE>
                        </SAMPLE_ATTRIBUTE>
                        <SAMPLE_ATTRIBUTE>
                                <TAG>geographic location (country and/or sea)</TAG>
                                <VALUE>China</VALUE>
                        </SAMPLE_ATTRIBUTE>
                        <SAMPLE_ATTRIBUTE>
                                <TAG>geographic location (region and locality)</TAG>
                                <VALUE>Xinjiang province</VALUE>
                        </SAMPLE_ATTRIBUTE>
                        <SAMPLE_ATTRIBUTE>
                                <TAG>host health state</TAG>
                                <VALUE>Hospital care required</VALUE>
                        </SAMPLE_ATTRIBUTE>
                        <SAMPLE_ATTRIBUTE>
                                <TAG>isolate</TAG>
                                <VALUE>66019</VALUE>
                        </SAMPLE_ATTRIBUTE>
                        <SAMPLE_ATTRIBUTE>
                                <TAG>collecting institution</TAG>
                                <VALUE>Special Pathogens Laboratory; 4-7-1 Gakuen, Musashimurayama, Tokyo 208-0011</VALUE>
                        </SAMPLE_ATTRIBUTE>
                        <SAMPLE_ATTRIBUTE>
                                <TAG>authors</TAG>
                                <VALUE>I. Kurane, M. Saijo, Q. Tang, S. Morikawa, T. Qing, Z. Xinqin</VALUE>
                        </SAMPLE_ATTRIBUTE>
                </SAMPLE_ATTRIBUTES>
        </SAMPLE>
</SAMPLE_SET>
"""

test_sample_xml_response = """
<RECEIPT receiptDate="2017-07-25T16:07:50.248+01:00" submissionFile="submission.xml" success="true">
    <SAMPLE accession="ERS1833148" alias="MT5176" status="PRIVATE">
        <EXT_ID accession="SAMEA104174130" type="biosample"/>
    </SAMPLE>
    <SUBMISSION accession="ERA979927" alias="MT5176_submission"/>
    <MESSAGES>
        <INFO>This submission is a TEST submission and will be discarded within 24 hours</INFO>
    </MESSAGES>
    <ACTIONS>ADD</ACTIONS>
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
        config.metadata_mapping = {
            "subject exposure": {"loculus_fields": ["exposure_event"]},
            "type exposure": {"loculus_fields": ["exposure_event"]},
            "hospitalisation": {
                "loculus_fields": ["host_health_state"],
                "function": "match",
                "args": ["Hospital"],
            },
            "illness symptoms": {"loculus_fields": ["signs_and_symptoms"]},
            "collection date": {"loculus_fields": ["sample_collection_date"]},
            "geographic location (country and/or sea)": {"loculus_fields": ["geo_loc_country"]},
            "geographic location (region and locality)": {"loculus_fields": ["geo_loc_admin_1"]},
            "sample capture status": {"loculus_fields": ["purpose_of_sampling"]},
            "host disease outcome": {"loculus_fields": ["host_health_outcome"]},
            "host common name": {"loculus_fields": ["host_name_common"]},
            "host age": {"loculus_fields": ["host_age"]},
            "host health state": {"loculus_fields": ["host_health_state"]},
            "host sex": {"loculus_fields": ["host_gender"]},
            "host scientific name": {"loculus_fields": ["host_name_scientific"]},
            "isolate": {"loculus_fields": ["specimen_collector_sample_id"]},
            "collecting institution": {
                "loculus_fields": ["sequenced_by_organization", "author_affiliations"]
            },
            "receipt date": {"loculus_fields": ["received date"]},
            "isolation source host-associated": {
                "loculus_fields": ["anatomical material", "anatomical part", "body product"]
            },
            "isolation source non-host-associated": {
                "loculus_fields": ["environmental site", "environmental material"]
            },
            "authors": {"loculus_fields": ["authors"]},
        }
        config.db_name = "Loculus"
        config.unique_project_suffix = "test suffix"
        row = {}
        row["accession"] = "test_accession"
        organism = "test organism"
        row["organism"] = organism
        sample_metadata = {
            "authors": "I. Kurane, M. Saijo, Q. Tang, S. Morikawa, T. Qing, Z. Xinqin",
            "host_age": None,
            "length_L": 0,
            "length_M": 5368,
            "length_S": 0,
            "display_name": "China/LOC_000001Y.1",
            "food_product": None,
            "geo_loc_city": None,
            "geo_loc_site": None,
            "host_age_bin": None,
            "host_disease": None,
            "total_snps_L": None,
            "total_snps_M": 1018,
            "total_snps_S": None,
            "amplicon_size": None,
            "host_taxon_id": None,
            "ncbi_sourcedb": "GenBank",
            "completeness_L": None,
            "completeness_M": 1.0,
            "completeness_S": None,
            "exposure_event": None,
            "frame_shifts_L": None,
            "frame_shifts_M": "[]",
            "frame_shifts_S": None,
            "passage_method": None,
            "passage_number": None,
            "travel_history": None,
            "anatomical_part": None,
            "geo_loc_admin_1": "Xinjiang province",
            "geo_loc_admin_2": None,
            "geo_loc_country": "China",
            "insdc_version_L": None,
            "insdc_version_M": 1,
            "insdc_version_S": None,
            "ncbi_virus_name": "Orthonairovirus haemorrhagiae",
            "sequencing_date": None,
            "dehosting_method": None,
            "exposure_details": None,
            "exposure_setting": None,
            "host_name_common": None,
            "ncbi_update_date": "2023-06-17",
            "collection_device": None,
            "collection_method": None,
            "depth_of_coverage": None,
            "host_health_state": "Hospital care required",
            "ncbi_release_date": "2002-02-07",
            "sra_run_accession": None,
            "environmental_site": None,
            "ncbi_protein_count": None,
            "signs_and_symptoms": None,
            "anatomical_material": None,
            "author_affiliations": "Special Pathogens Laboratory; 4-7-1 Gakuen, Musashimurayama, Tokyo 208-0011",
            "breadth_of_coverage": None,
            "host_health_outcome": None,
            "host_origin_country": None,
            "ncbi_virus_tax_id_L": None,
            "ncbi_virus_tax_id_M": None,
            "ncbi_virus_tax_id_S": None,
            "purpose_of_sampling": None,
            "sequencing_protocol": None,
            "specimen_processing": None,
            "host_name_scientific": None,
            "presampling_activity": None,
            "sample_received_date": None,
            "total_deleted_nucs_L": None,
            "total_deleted_nucs_M": 6,
            "total_deleted_nucs_S": None,
            "total_frame_shifts_L": None,
            "total_frame_shifts_M": 0,
            "total_frame_shifts_S": None,
            "total_unknown_nucs_L": None,
            "total_unknown_nucs_M": 0,
            "total_unknown_nucs_S": None,
            "biosample_accession_L": None,
            "biosample_accession_M": None,
            "biosample_accession_S": None,
            "purpose_of_sequencing": None,
            "sequencing_assay_type": None,
            "sequencing_instrument": None,
            "total_inserted_nucs_L": None,
            "total_inserted_nucs_M": 8,
            "total_inserted_nucs_S": None,
            "environmental_material": None,
            "insdc_accession_base_L": None,
            "insdc_accession_base_M": "AB069669",
            "insdc_accession_base_S": None,
            "insdc_accession_full_L": None,
            "insdc_accession_full_M": "AB069669.1",
            "insdc_accession_full_S": None,
            "ncbi_submitter_country": None,
            "quality_control_issues": None,
            "sample_collection_date": None,
            "total_ambiguous_nucs_L": None,
            "total_ambiguous_nucs_M": 0,
            "total_ambiguous_nucs_S": None,
            "bioproject_accession": None,
            "food_product_properties": None,
            "host_vaccination_status": None,
            "quality_control_details": None,
            "sequenced_by_contact_name": None,
            "sequenced_by_organization": None,
            "amplicon_pcr_primer_scheme": None,
            "diagnostic_target_presence": None,
            "previous_infection_disease": None,
            "reference_genome_accession": None,
            "sequenced_by_contact_email": None,
            "diagnostic_measurement_unit": None,
            "diagnostic_target_gene_name": None,
            "previous_infection_organism": None,
            "quality_control_method_name": None,
            "specimen_processing_details": None,
            "diagnostic_measurement_value": None,
            "specimen_collector_sample_id": "66019",
            "diagnostic_measurement_method": None,
            "quality_control_determination": None,
            "quality_control_method_version": None,
            "experimental_specimen_role_type": None,
            "consensus_sequence_software_name": None,
            "consensus_sequence_software_version": None,
            "raw_sequence_data_processing_method": None,
            "accession": "LOC_000001Y",
            "version": 1,
            "submissionId": "AB069669.1.M",
            "accessionVersion": "LOC_000001Y.1",
            "isRevocation": False,
            "submitter": "insdc_ingest_user",
            "groupId": 1,
            "groupName": "insdc_ingest_group",
            "submittedDate": "2024-07-18",
            "submittedAtTimestamp": 1721314541,
            "releasedAtTimestamp": 1721315585,
            "releasedDate": "2024-07-18",
            "versionStatus": "LATEST_VERSION",
            "dataUseTerms": "OPEN",
            "dataUseTermsRestrictedUntil": None,
            "dataUseTermsUrl": "https://#TODO-MVP/open",
        }
        sample_set = construct_sample_set_object(
            config, organism_metadata, sample_metadata, center_name, row, organism
        )
        assert xmltodict.parse(
            dataclass_to_xml(sample_set, root_name="SAMPLE_SET")
        ) == xmltodict.parse(test_sample_xml_request)


if __name__ == "__main__":
    unittest.main()
