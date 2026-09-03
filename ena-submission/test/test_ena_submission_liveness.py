"""
WARNING: This script queries the INSDC databases to check liveness it also requires a
local PostgreSQL database to be running with the loculus schema applied.
docker run --name test-postgres -e POSTGRES_USER=postgres -e POSTGRES_PASSWORD=unsecure \
    -e POSTGRES_DB=loculus -p 5432:5432 -d postgres
flyway -url=jdbc:postgresql://localhost:5432/loculus -schemas=ena_deposition_schema \
    -user=postgres -password=unsecure -locations=filesystem:./flyway/sql migrate
"""

import logging
from dataclasses import asdict
from typing import Final

import pytest
from ena_deposition.check_external_visibility import (
    COLUMN_CONFIGS,
    EntityType,
    check_and_update_visibility_for_column,
)
from ena_deposition.submission_db_helper import (
    Status,
    add_to_assembly_table,
    add_to_project_table,
    add_to_sample_table,
    find_conditions_in_db,
    update_db_where_conditions,
)
from helpers import SubmissionTestBase

logger = logging.getLogger(__name__)
# ruff: noqa: S101 (allow asserts in tests))


class TestFirstPublicUpdate(SubmissionTestBase):
    PROJECT_CONFIG: Final = {
        "invalid_result": {"bioproject_accession": "PRJEB2"},
        "valid_result": {"bioproject_accession": "PRJEB53055"},
        "base_entry": {
            "group_id": 1,
            "organism": "test_organism",
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
            "insdc_accession_full_seg1": "XY999999.1",
            "insdc_accession_full_seg2": "XY999998.1",
        },
        "valid_result": {
            "insdc_accession_full_seg1": "OZ271453.1",
            "insdc_accession_full_seg2": "OZ271454.1",
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
        entity_id = add_function(self.db_engine, entry)
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
            conditions = asdict(entry.pkey)

        # Run visibility check with invalid accessions
        check_and_update_visibility_for_column(
            self.config, self.db_engine, entity_type, column_name
        )

        # Check that visibility column is None
        rows = find_conditions_in_db(
            self.db_engine,
            config.entry_class,
            conditions=conditions,
        )
        logger.debug(f"Rows found after invalid check: {rows}")
        assert len(rows) == 1, f"{entity_type.value} not found in table."

        visibility_value = getattr(rows[0], column_name)
        assert visibility_value is None, (
            f"{column_name} should be None for non-existing accessions. Got: {visibility_value}"
        )

        # Update the entry to have valid accessions
        update_db_where_conditions(
            self.db_engine,
            config.entry_class,
            conditions=conditions,
            update_values={"result": test_data["valid_result"]},
        )

        # Run the visibility check again with valid accessions
        check_and_update_visibility_for_column(
            self.config, self.db_engine, entity_type, column_name
        )

        # Check that visibility column is now updated
        rows = find_conditions_in_db(
            self.db_engine,
            config.entry_class,
            conditions=conditions,
        )
        assert len(rows) == 1, f"{entity_type.value} not found in table after update."

        visibility_value = getattr(rows[0], column_name)
        assert visibility_value is not None, (
            f"{column_name} should be updated to current timestamp for valid accessions. "
            f"Got: {visibility_value}"
        )
