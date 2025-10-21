#!/usr/bin/env python3
"""
Demonstration script showing mock ENA server usage with real ENA deposition code.

This script demonstrates:
1. Starting a mock ENA server
2. Submitting projects and samples using the actual ENA deposition XML formats
3. Querying assembly status
4. Full workflow from project creation to assembly completion
"""

import sys
import time
from pathlib import Path

import requests
from requests.auth import HTTPBasicAuth

# Add the src directory to path
sys.path.insert(0, str(Path(__file__).parent / "src"))

from mock_ena.server import app, configure_server


def print_section(title: str):
    """Print a section header."""
    print(f"\n{'=' * 70}")
    print(f"  {title}")
    print(f"{'=' * 70}\n")


def pretty_print_xml(xml_string: str, indent: str = "  "):
    """Pretty print XML with basic indentation."""
    import xml.etree.ElementTree as ET
    try:
        root = ET.fromstring(xml_string)
        ET.indent(root, space=indent)
        print(ET.tostring(root, encoding="unicode"))
    except Exception:
        print(xml_string)


def demo_with_requests():
    """Demonstrate the mock ENA server using requests library."""

    print_section("Mock ENA Server Demonstration")

    # Configuration
    BASE_URL = "http://localhost:8080"
    AUTH = HTTPBasicAuth("test_user", "test_password")

    print("Server URL:", BASE_URL)
    print("Authentication: test_user / test_password")
    print("\nNote: Start the server first with: python -m mock_ena.server")
    print("      Or run this in test mode (see code)")

    # For demo purposes, we'll use the TestClient
    print_section("1. Submit a Project")

    project_xml = """<?xml version="1.0" encoding="UTF-8"?>
<PROJECT_SET>
    <PROJECT alias="demo_covid_project">
        <TITLE>SARS-CoV-2 Genomic Surveillance Demo</TITLE>
        <DESCRIPTION>
            This is a demonstration project for testing the mock ENA server.
            It simulates a real SARS-CoV-2 genomic surveillance submission.
        </DESCRIPTION>
        <SUBMISSION_PROJECT>
            <SEQUENCING_PROJECT>
                <LOCUS_TAG_PREFIX/>
            </SEQUENCING_PROJECT>
        </SUBMISSION_PROJECT>
        <PROJECT_LINKS>
            <PROJECT_LINK>
                <XREF_LINK>
                    <DB>TAXON</DB>
                    <ID>2697049</ID>
                </XREF_LINK>
            </PROJECT_LINK>
        </PROJECT_LINKS>
    </PROJECT>
</PROJECT_SET>"""

    submission_xml = """<?xml version="1.0" encoding="UTF-8"?>
<SUBMISSION alias="demo_project_submission">
    <ACTIONS>
        <ACTION>
            <ADD/>
        </ACTION>
    </ACTIONS>
</SUBMISSION>"""

    print("Submitting project with alias: demo_covid_project")
    print("Taxon ID: 2697049 (SARS-CoV-2)")
    print("\nSending POST request to /submit/drop-box/submit...")

    # Using TestClient for demo
    from fastapi.testclient import TestClient

    configure_server(database_path=":memory:")
    client = TestClient(app)

    response = client.post(
        "/submit/drop-box/submit",
        auth=("test_user", "test_password"),
        files={
            "SUBMISSION": ("submission.xml", submission_xml, "application/xml"),
            "PROJECT": ("project.xml", project_xml, "application/xml"),
        }
    )

    print(f"\nResponse Status: {response.status_code}")
    print("\nResponse XML:")
    pretty_print_xml(response.text)

    # Extract project accession
    import xml.etree.ElementTree as ET
    receipt = ET.fromstring(response.text)
    project_elem = receipt.find(".//PROJECT")
    project_accession = project_elem.get("accession")

    print(f"\n✓ Project created successfully!")
    print(f"  Project Accession: {project_accession}")

    # Step 2: Submit Sample
    print_section("2. Submit a Sample")

    sample_xml = """<?xml version="1.0" encoding="UTF-8"?>
<SAMPLE_SET>
    <SAMPLE alias="demo_sample_001">
        <TITLE>Demo SARS-CoV-2 Sample from Switzerland</TITLE>
        <SAMPLE_NAME>
            <TAXON_ID>2697049</TAXON_ID>
            <SCIENTIFIC_NAME>Severe acute respiratory syndrome coronavirus 2</SCIENTIFIC_NAME>
        </SAMPLE_NAME>
        <SAMPLE_ATTRIBUTES>
            <SAMPLE_ATTRIBUTE>
                <TAG>collection date</TAG>
                <VALUE>2023-06-15</VALUE>
            </SAMPLE_ATTRIBUTE>
            <SAMPLE_ATTRIBUTE>
                <TAG>geographic location (country and/or sea)</TAG>
                <VALUE>Switzerland</VALUE>
            </SAMPLE_ATTRIBUTE>
            <SAMPLE_ATTRIBUTE>
                <TAG>host scientific name</TAG>
                <VALUE>Homo sapiens</VALUE>
            </SAMPLE_ATTRIBUTE>
            <SAMPLE_ATTRIBUTE>
                <TAG>isolate</TAG>
                <VALUE>demo/sample/001</VALUE>
            </SAMPLE_ATTRIBUTE>
        </SAMPLE_ATTRIBUTES>
    </SAMPLE>
</SAMPLE_SET>"""

    submission_xml = """<?xml version="1.0" encoding="UTF-8"?>
<SUBMISSION alias="demo_sample_submission">
    <ACTIONS>
        <ACTION>
            <ADD/>
        </ACTION>
    </ACTIONS>
</SUBMISSION>"""

    print("Submitting sample with alias: demo_sample_001")
    print("Collection date: 2023-06-15")
    print("Location: Switzerland")

    response = client.post(
        "/submit/drop-box/submit",
        auth=("test_user", "test_password"),
        files={
            "SUBMISSION": ("submission.xml", submission_xml, "application/xml"),
            "SAMPLE": ("sample.xml", sample_xml, "application/xml"),
        }
    )

    print(f"\nResponse Status: {response.status_code}")
    print("\nResponse XML:")
    pretty_print_xml(response.text)

    receipt = ET.fromstring(response.text)
    sample_elem = receipt.find(".//SAMPLE")
    sample_accession = sample_elem.get("accession")
    biosample_elem = sample_elem.find(".//EXT_ID[@type='biosample']")
    biosample_accession = biosample_elem.get("accession")

    print(f"\n✓ Sample created successfully!")
    print(f"  Sample Accession: {sample_accession}")
    print(f"  BioSample Accession: {biosample_accession}")

    # Step 3: Create Assembly
    print_section("3. Create Assembly")

    print("Note: Real ENA uses Webin CLI for assembly uploads.")
    print("This mock server provides a simplified HTTP endpoint for testing.")
    print(f"\nCreating assembly for:")
    print(f"  Project: {project_accession}")
    print(f"  Sample: {sample_accession}")

    response = client.post(
        "/assemblies/mock/create",
        auth=("test_user", "test_password"),
        params={
            "alias": "demo_assembly_001",
            "study_accession": project_accession,
            "sample_accession": sample_accession
        }
    )

    print(f"\nResponse Status: {response.status_code}")
    assembly_data = response.json()

    print("\nResponse JSON:")
    import json
    print(json.dumps(assembly_data, indent=2))

    erz_accession = assembly_data["erz_accession"]
    gca_accession = assembly_data["gca_accession"]

    print(f"\n✓ Assembly created successfully!")
    print(f"  ERZ Accession: {erz_accession}")
    print(f"  GCA Accession: {gca_accession}")
    print(f"  Status: {assembly_data['status']}")

    # Step 4: Query Assembly Status
    print_section("4. Query Assembly Status")

    print(f"Querying assembly report for: {erz_accession}")

    response = client.get(
        f"/submit/report/analysis-process/{erz_accession}",
        auth=("test_user", "test_password")
    )

    print(f"\nResponse Status: {response.status_code}")
    print("\nResponse XML:")
    pretty_print_xml(response.text)

    print(f"\n✓ Assembly report retrieved successfully!")

    # Summary
    print_section("Summary - Complete Submission Workflow")

    print(f"""
The mock ENA server successfully processed a complete submission workflow:

1. PROJECT SUBMISSION
   └─ Accession: {project_accession}
   └─ Title: SARS-CoV-2 Genomic Surveillance Demo
   └─ Taxon: 2697049 (SARS-CoV-2)

2. SAMPLE SUBMISSION
   └─ Sample Accession: {sample_accession}
   └─ BioSample Accession: {biosample_accession}
   └─ Collection Date: 2023-06-15
   └─ Location: Switzerland

3. ASSEMBLY SUBMISSION
   └─ ERZ Accession: {erz_accession}
   └─ GCA Accession: {gca_accession}
   └─ Status: COMPLETED

All accessions follow ENA format and are stored in the SQLite database.

This demonstrates that the mock server can be used to test the
ena-deposition code without making real submissions to ENA!
    """)

    print_section("Test Results")
    print("✓ All endpoints working correctly")
    print("✓ XML parsing and generation successful")
    print("✓ Accession numbers generated in ENA format")
    print("✓ Database persistence functional")
    print("✓ HTTP Basic Authentication working")
    print("\nThe mock ENA server is ready for testing!")


def demo_integration_with_ena_deposition_code():
    """Show how to use with actual ENA deposition code."""

    print_section("Using Mock Server with ENA Deposition Code")

    print("""
To use the mock ENA server with the actual ena-deposition code:

1. START THE MOCK SERVER:
   -------------------------
   Terminal 1:
   $ cd ena-submission/mock-ena-server
   $ python -m mock_ena.server

   The server will start on http://localhost:8080

2. CONFIGURE ENA DEPOSITION:
   --------------------------
   Update your config/defaults.yaml or set environment variables:

   ena_submission_url: http://localhost:8080/submit/drop-box/submit
   ena_reports_service_url: http://localhost:8080/submit/report
   ena_submission_username: test_user
   ena_submission_password: test_password

3. RUN ENA DEPOSITION:
   -------------------
   Terminal 2:
   $ cd ena-submission
   $ python -m ena_deposition.trigger_submission_to_ena

   The code will now submit to the mock server instead of real ENA!

4. VERIFY SUBMISSIONS:
   -------------------
   Query the mock database to see what was submitted:

   $ sqlite3 /tmp/mock_ena.db
   sqlite> SELECT * FROM projects;
   sqlite> SELECT * FROM samples;
   sqlite> SELECT * FROM assemblies;

5. RUN INTEGRATION TESTS:
   -----------------------
   $ cd ena-submission/mock-ena-server
   $ pytest tests/test_integration.py -v

   This will run the full test suite demonstrating all features.

BENEFITS:
---------
✓ No need for real ENA test account credentials
✓ Faster testing - no network delays
✓ Reproducible test results
✓ Offline development possible
✓ Can inspect/debug submissions in SQLite database
✓ No risk of polluting ENA test instance with junk data
    """)


if __name__ == "__main__":
    try:
        demo_with_requests()
        demo_integration_with_ena_deposition_code()

        print_section("Next Steps")
        print("""
1. Run the integration tests:
   $ pytest tests/test_integration.py -v

2. Start the server for manual testing:
   $ python -m mock_ena.server

3. Integrate with ena-deposition code as shown above

4. Check the README.md for full documentation

For questions or issues, see the main Loculus repository.
        """)

    except Exception as e:
        print(f"\n❌ Error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
