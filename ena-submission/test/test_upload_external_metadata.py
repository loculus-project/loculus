# ruff: noqa: S101 (allow asserts in tests)

from unittest.mock import Mock, patch

from ena_deposition.config import get_config
from ena_deposition.submission_db_helper import SubmissionTableEntry
from ena_deposition.upload_external_metadata_to_loculus import (
    get_external_metadata_to_upload,
    merged_external_metadata,
)

CONFIG_FILE = "./test/test_config.yaml"
MODULE = "ena_deposition.upload_external_metadata_to_loculus"


def test_get_external_metadata_to_upload_splits_accession_and_version_scope() -> None:
    config = get_config(CONFIG_FILE)
    fields = config.loculus_accession_fields
    organism = next(iter(config.enaOrganisms))
    entry = SubmissionTableEntry(
        accession="LOC_1", version=2, organism=organism, group_id=1, submit_raw_reads=True
    )

    with (
        patch(f"{MODULE}.get_bioproject_accession_from_db") as bioproject,
        patch(f"{MODULE}.get_biosample_accession_from_db") as biosample,
        patch(f"{MODULE}.get_run_accession_from_db") as run,
        patch(f"{MODULE}.get_assembly_accessions_from_db") as assembly,
    ):
        bioproject.return_value = {fields.bioproject: "PRJEB1"}
        biosample.return_value = {fields.biosample: "SAMEA1"}
        run.return_value = ({fields.run: "ERR1"}, True)
        assembly.return_value = ({fields.gca: "GCA_1.1"}, True)

        payloads, all_present = get_external_metadata_to_upload(Mock(), entry, config)

    assert all_present
    assert payloads == [
        {
            "accession": "LOC_1",
            "externalMetadata": {
                fields.bioproject: "PRJEB1",
                fields.biosample: "SAMEA1",
            },
        },
        {
            "accession": "LOC_1",
            "version": 2,
            "externalMetadata": {fields.gca: "GCA_1.1", fields.run: "ERR1"},
        },
    ]
    assert merged_external_metadata(payloads) == {
        fields.bioproject: "PRJEB1",
        fields.biosample: "SAMEA1",
        fields.run: "ERR1",
        fields.gca: "GCA_1.1",
    }
