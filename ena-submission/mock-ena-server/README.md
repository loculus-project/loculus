# Mock ENA Server

A simplified mock implementation of the European Nucleotide Archive (ENA) submission API for testing the Loculus ENA deposition code.

## Overview

This mock server simulates the ENA submission workflow, allowing you to test ENA deposition code locally without making real submissions to ENA's test or production servers. It implements the core ENA submission endpoints and data formats.

## Features

- **HTTP Basic Authentication**: Mimics ENA's authentication mechanism
- **XML-based API**: Accepts and returns XML in ENA's format
- **SQLite Database**: Persists submissions, projects, samples, and assemblies
- **Accession Generation**: Generates mock ENA-style accession numbers (PRJEB, ERS, SAMEA, ERZ, GCA)
- **Full Workflow Support**: Project → Sample → Assembly submission workflow
- **FastAPI Backend**: Modern, fast, and easy to extend

## Architecture

```
mock-ena-server/
├── src/mock_ena/
│   ├── __init__.py          # Package initialization
│   ├── server.py            # FastAPI server with endpoints
│   ├── database.py          # SQLite models and operations
│   ├── accessions.py        # Accession number generator
│   └── xml_utils.py         # XML parsing and generation
├── tests/
│   └── test_integration.py  # Integration tests
├── pyproject.toml           # Package configuration
├── requirements.txt         # Dependencies
└── README.md                # This file
```

## Installation

### Using pip (recommended)

```bash
cd ena-submission/mock-ena-server
pip install -e .
```

### For development with tests

```bash
pip install -e ".[test]"
```

## Usage

### Starting the Server

#### Option 1: Using uvicorn directly

```bash
cd ena-submission/mock-ena-server
python -m uvicorn mock_ena.server:app --host 0.0.0.0 --port 8080
```

#### Option 2: Using the Python module

```bash
python -m mock_ena.server
```

The server will start on `http://localhost:8080`

### Configuration

By default, the server uses:
- **Username**: `test_user`
- **Password**: `test_password`
- **Database**: `/tmp/mock_ena.db` (SQLite)

You can customize these by modifying `server.py` or using the `configure_server()` function:

```python
from mock_ena.server import configure_server

configure_server(
    database_path="/path/to/database.db",
    username="my_username",
    password="my_password"
)
```

## API Endpoints

### 1. Submit Project or Sample

**Endpoint**: `POST /submit/drop-box/submit`

**Authentication**: HTTP Basic Auth

**Request Format**: `multipart/form-data` with XML files

**Files**:
- `SUBMISSION` (required): Submission metadata XML
- `PROJECT` (optional): Project XML
- `SAMPLE` (optional): Sample XML

**Response**: XML RECEIPT with accession numbers

**Example (Project Submission)**:

```bash
curl -X POST http://localhost:8080/submit/drop-box/submit \
  -u test_user:test_password \
  -F "SUBMISSION=@submission.xml" \
  -F "PROJECT=@project.xml"
```

**Response**:
```xml
<RECEIPT receiptDate="2025-10-21T10:30:00.000+00:00" submissionFile="submission.xml" success="true">
  <PROJECT accession="PRJEB001000" alias="my_project" status="PRIVATE" />
  <SUBMISSION accession="ERA-SUBMIT-ABC123XYZ456" alias="my_submission" />
  <MESSAGES>
    <INFO>This submission is a TEST submission and will be discarded within 24 hours</INFO>
  </MESSAGES>
  <ACTIONS>ADD</ACTIONS>
</RECEIPT>
```

### 2. Query Assembly Status

**Endpoint**: `GET /submit/report/analysis-process/{erz_accession}`

**Authentication**: HTTP Basic Auth

**Response**: XML with assembly status and GCA accession

**Example**:

```bash
curl http://localhost:8080/submit/report/analysis-process/ERZ0004000 \
  -u test_user:test_password
```

**Response**:
```xml
<ASSEMBLY_REPORT>
  <ASSEMBLY accession="ERZ0004000" status="COMPLETED">
    <EXT_ID accession="GCA_000006000.1" type="insdc" />
  </ASSEMBLY>
</ASSEMBLY_REPORT>
```

### 3. Mock Assembly Creation (Helper Endpoint)

**Endpoint**: `POST /assemblies/mock/create`

**Authentication**: HTTP Basic Auth

**Note**: This endpoint doesn't exist in real ENA - it's a helper for testing since real ENA uses Webin CLI for assemblies.

**Parameters**:
- `alias`: Assembly alias
- `study_accession`: Project accession (PRJEB...)
- `sample_accession`: Sample accession (ERS...)

**Example**:

```bash
curl -X POST "http://localhost:8080/assemblies/mock/create?alias=test_assembly&study_accession=PRJEB001000&sample_accession=ERS0002000" \
  -u test_user:test_password
```

**Response**:
```json
{
  "erz_accession": "ERZ0004000",
  "gca_accession": "GCA_000006000.1",
  "submission_accession": "ERA-SUBMIT-...",
  "status": "COMPLETED"
}
```

### 4. Health Check

**Endpoint**: `GET /health`

**Authentication**: None

**Response**: `{"status": "healthy"}`

## Running Tests

The integration tests demonstrate how the mock ENA server can be used to test the real ENA deposition code.

```bash
# Install test dependencies
pip install -e ".[test]"

# Run tests
pytest tests/test_integration.py -v
```

### Test Coverage

The tests demonstrate:

1. **Authentication**: Verifying HTTP Basic Auth works correctly
2. **Project Submission**: Submitting PROJECT XML and receiving accessions
3. **Sample Submission**: Submitting SAMPLE XML with BioSample accessions
4. **Assembly Workflow**: Creating and querying assembly status
5. **Full Workflow**: Complete Project → Sample → Assembly pipeline
6. **Error Handling**: Missing files and validation errors
7. **Database Persistence**: SQLite storage and retrieval
8. **Accession Generation**: Consistent accession number generation

## Using with ENA Deposition Code

To use the mock server with the real ENA deposition code:

1. **Start the mock server**:
   ```bash
   python -m mock_ena.server
   ```

2. **Configure the ENA deposition code** to point to the mock server:

   ```yaml
   # In config/defaults.yaml or environment variables
   ena_submission_url: http://localhost:8080/submit/drop-box/submit
   ena_reports_service_url: http://localhost:8080/submit/report
   ena_submission_username: test_user
   ena_submission_password: test_password
   ```

3. **Run the ENA deposition code** as normal - it will now submit to the mock server instead of real ENA.

## Example: Full Submission Workflow

```python
import requests
from requests.auth import HTTPBasicAuth

BASE_URL = "http://localhost:8080"
AUTH = HTTPBasicAuth("test_user", "test_password")

# 1. Submit Project
project_xml = """<?xml version="1.0" encoding="UTF-8"?>
<PROJECT_SET>
    <PROJECT alias="my_covid_project">
        <TITLE>SARS-CoV-2 Surveillance</TITLE>
        <DESCRIPTION>Genomic surveillance of SARS-CoV-2</DESCRIPTION>
        <SUBMISSION_PROJECT>
            <SEQUENCING_PROJECT/>
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
<SUBMISSION alias="project_submission">
    <ACTIONS><ACTION><ADD/></ACTION></ACTIONS>
</SUBMISSION>"""

response = requests.post(
    f"{BASE_URL}/submit/drop-box/submit",
    auth=AUTH,
    files={
        "SUBMISSION": ("submission.xml", submission_xml),
        "PROJECT": ("project.xml", project_xml),
    }
)

print(response.text)
# Output: <RECEIPT ...><PROJECT accession="PRJEB001000" ...

# 2. Submit Sample (similar pattern)
# 3. Create Assembly (using mock endpoint)
# 4. Query assembly status
```

## Database Schema

The SQLite database contains four tables:

### projects
- `id`: Integer primary key
- `alias`: Unique project alias
- `accession`: Unique PRJEB accession
- `submission_accession`: ERA-SUBMIT accession
- `title`: Project title
- `description`: Project description
- `taxon_id`: Organism taxon ID
- `created_at`: Timestamp

### samples
- `id`: Integer primary key
- `alias`: Unique sample alias
- `accession`: Unique ERS accession
- `biosample_accession`: Unique SAMEA accession
- `submission_accession`: ERA-SUBMIT accession
- `taxon_id`: Organism taxon ID
- `scientific_name`: Scientific name
- `created_at`: Timestamp

### assemblies
- `id`: Integer primary key
- `alias`: Unique assembly alias
- `accession`: Unique ERZ accession
- `gca_accession`: Unique GCA accession
- `submission_accession`: ERA-SUBMIT accession
- `study_accession`: Project accession (PRJEB)
- `sample_accession`: Sample accession (ERS)
- `status`: Processing status (PENDING, PROCESSING, COMPLETED, ERROR)
- `created_at`: Timestamp
- `updated_at`: Timestamp

### submissions
- `id`: Integer primary key
- `alias`: Submission alias
- `accession`: Unique ERA-SUBMIT accession
- `submission_type`: Type (PROJECT, SAMPLE, ASSEMBLY)
- `status`: Status (SUCCESS, ERROR)
- `created_at`: Timestamp

## Accession Formats

The mock server generates accessions in ENA format:

| Type | Format | Example |
|------|--------|---------|
| Project | PRJEB + 6 digits | PRJEB001000 |
| Sample | ERS + 7 digits | ERS0002000 |
| BioSample | SAMEA + 7 digits | SAMEA0003000 |
| Assembly | ERZ + 7 digits | ERZ0004000 |
| GCA | GCA_ + 9 digits + .1 | GCA_000006000.1 |
| Submission | ERA-SUBMIT- + 12 chars | ERA-SUBMIT-ABC123XYZ456 |

## Limitations

This is a simplified mock for testing purposes. It does NOT:

- Validate XML schemas (basic parsing only)
- Implement all ENA endpoints (only submission and report)
- Support Webin CLI (uses helper endpoint instead)
- Perform actual sequence analysis
- Connect to real NCBI/INSDC databases
- Implement ENA's full business logic and validation rules
- Support MODIFY, CANCEL, or other submission actions (only ADD)

## Differences from Real ENA

1. **Assembly Submission**: Real ENA uses Webin CLI tool for assembly uploads. This mock provides a simplified HTTP endpoint instead.

2. **Processing Time**: Real ENA processes submissions asynchronously. This mock returns results immediately.

3. **Validation**: Real ENA performs extensive validation. This mock does minimal validation.

4. **Accessions**: Real accessions are assigned by ENA's database. Mock accessions are deterministic based on a counter.

## Development

### Adding New Endpoints

To add new endpoints, modify `src/mock_ena/server.py`:

```python
@app.post("/your/new/endpoint")
async def your_endpoint(
    username: Annotated[str, Depends(verify_credentials)],
    db: MockENADatabase = Depends(get_database),
):
    # Your implementation
    pass
```

### Extending the Database

To add new tables or fields, modify `src/mock_ena/database.py`:

```python
@dataclass
class NewEntity:
    id: Optional[int] = None
    # Add your fields
```

Then add corresponding methods to `MockENADatabase` class.

## License

This mock server is part of the Loculus project. See the main project LICENSE for details.

## Support

For issues or questions:
1. Check the integration tests for usage examples
2. Review the ENA deposition code in `ena-submission/src/`
3. Open an issue in the Loculus repository

## See Also

- [ENA Submission Documentation](https://ena-docs.readthedocs.io/en/latest/submit/general-guide.html)
- [Loculus ENA Deposition](../README.md)
- [FastAPI Documentation](https://fastapi.tiangolo.com/)
