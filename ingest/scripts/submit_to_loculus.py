import json
import logging
from dataclasses import dataclass
from pathlib import Path
from time import sleep

import click
import requests
import yaml

logging.basicConfig(level=logging.DEBUG)


@dataclass
class Config:
    organism: str
    backend_url: str
    keycloak_token_url: str
    keycloak_client_id: str
    username: str
    password: str
    group_name: str


def backend_url(config: Config) -> str:
    """Right strip the URL to remove trailing slashes"""
    return f"{config.backend_url.rstrip('/')}"


def organism_url(config: Config) -> str:
    return f"{backend_url(config)}/{config.organism.strip('/')}"


def get_jwt(config: Config) -> str:
    """
    Get a JWT token for the given username and password
    """

    data = {
        "username": config.username,
        "password": config.password,
        "grant_type": "password",
        "client_id": config.keycloak_client_id,
    }
    headers = {"Content-Type": "application/x-www-form-urlencoded"}

    keycloak_token_url = config.keycloak_token_url

    response = requests.post(keycloak_token_url, data=data, headers=headers)
    response.raise_for_status()

    jwt_keycloak = response.json()
    jwt = jwt_keycloak["access_token"]
    return jwt


def create_group(config: Config) -> str:
    create_group_url = f"{backend_url(config)}/groups"
    token = get_jwt(config)
    group_name = config.group_name

    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}

    data = {
        "groupName": group_name,
        "institution": "NA",
        "address": {
            "line1": "1234 Loculus Street",
            "line2": "NA",
            "city": "Dortmund",
            "state": "NRW",
            "postalCode": "12345",
            "country": "Germany",
        },
        "contactEmail": "something@loculus.org",
    }

    logging.info(f"Creating group: {group_name}")
    create_group_response = requests.post(create_group_url, json=data, headers=headers)

    if not create_group_response.ok:
        print(f"Error creating group: {create_group_response.json()}")
        create_group_response.raise_for_status()

    group_id = create_group_response.json()["groupId"]

    logging.info(f"Group created: {group_id}")

    return group_id


def get_group_id(config: Config) -> str:
    """Returns group id"""
    get_user_groups_url = f"{backend_url(config)}/user/groups"
    token = get_jwt(config)

    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}

    get_groups_response = requests.get(get_user_groups_url, headers=headers)
    if not get_groups_response.ok:
        get_groups_response.raise_for_status()

    if len(get_groups_response.json()) > 0:
        group_id = get_groups_response.json()[0]["groupId"]
        logging.info(f"User is already in group: {group_id}")

        return group_id
    logging.info("User is not in any group. Creating a new group")
    return create_group(config)


def submit(metadata, sequences, config: Config, group_id):
    """
    Submit data to Loculus.
    """

    jwt = get_jwt(config)

    # Endpoint URL
    url = f"{organism_url(config)}/submit"

    # Headers with Bearer Authentication
    headers = {"Authorization": f"Bearer {jwt}"}

    # Files to be uploaded
    files = {
        "metadataFile": open(metadata, "rb"),
        "sequenceFile": open(sequences, "rb"),
    }

    # Query parameters
    params = {
        "groupId": group_id,
        "dataUseTermsType": "OPEN",
    }

    # POST request
    response = requests.post(url, headers=headers, files=files, params=params)
    response.raise_for_status()

    # Closing files
    files["metadataFile"].close()
    files["sequenceFile"].close()

    return response.json()


def approve(config: Config):
    """
    Get sequences that were preprocessed successfully and approve them.
    1. Get the ids of the sequences that were preprocessed successfully
        /ORGANISM/get-sequences
    2. Approve the sequences
    """
    jwt = get_jwt(config)

    url = f"{organism_url(config)}/get-sequences"

    # Headers with Bearer Authentication
    headers = {"Authorization": f"Bearer {jwt}"}

    # POST request
    response = requests.get(url, headers=headers)
    response.raise_for_status()

    payload = {"scope": "ALL"}

    url = f"{organism_url(config)}/approve-processed-data"

    response = requests.post(url, headers=headers, json=payload)
    response.raise_for_status()

    return response.json()


def get_submitted(config: Config):
    """Get previously submitted sequences
    This way we can avoid submitting the same sequences again
    """

    jwt = get_jwt(config)

    url = f"{organism_url(config)}/get-original-metadata"

    headers = {"Authorization": f"Bearer {jwt}"}
    params = {
        "fields": ["insdc_accession_base", "metadata_hash"],
        "groupIdsFilter": [],
        "statusesFilter": [],
    }

    response = requests.get(url, headers=headers, params=params)
    response.raise_for_status()

    # Of shape ndjson with {"accession":"LOC_0003BDR","version":1,"originalMetadata":{"authors":"L. Vanderzanden, M. Bray, D. Fuller, T. Roberts, D. Custer, K. Spik, P. Jahrling, J. Huggins, A. Schmaljohn, C. Schmaljohn, C.S. Schmaljohn","country":"","division":"","bioprojects":"","ncbi_length":"2220","isolate_name":"","insdc_version":"1","metadata_hash":"11ba508af2261e0e61cd04757601ee2cc42a364fec69f99c6ff58de002673a4a","ncbi_sourcedb":"GenBank","isolate_source":"","ncbi_host_name":"","sra_accessions":"","collection_date":"","ncbi_virus_name":"Zaire ebolavirus","ncbi_host_tax_id":"","ncbi_is_lab_host":"","ncbi_update_date":"2002-08-28T00:00:00Z","ncbi_completeness":"PARTIAL","ncbi_release_date":"1998-04-02T00:00:00Z","ncbi_virus_tax_id":"186538","submitter_country":"USA","author_affiliation":"USAMRIID, Virology Division","ncbi_protein_count":"1","biosample_accession":"","insdc_accession_base":"AF054908","insdc_accession_full":"AF054908.1"}}
    # Reshape to: "insdc": {hash, loculus}

    # Initialize the dictionary to store results
    submitted_dict = {}

    # Parse each line of NDJSON
    for line in response.iter_lines():
        if line:  # Make sure line is not empty
            record = json.loads(line)
            loculus_accession = record.get("accession", "")
            original_metadata = record.get("originalMetadata", {})
            insdc_accession = original_metadata.get("insdc_accession_base", "")
            hash_value = original_metadata.get("metadata_hash", "")
            submitted_dict[insdc_accession] = {"hash": hash_value, "loculus": loculus_accession}

    return submitted_dict


# %%


@click.command()
@click.option(
    "--metadata",
    required=False,
    type=click.Path(exists=True),
)
@click.option(
    "--sequences",
    required=False,
    type=click.Path(exists=True),
)
@click.option(
    "--mode",
    required=True,
    type=click.Choice(["submit", "approve", "get-submitted"]),
)
@click.option(
    "--log-level",
    default="INFO",
    type=click.Choice(["DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"]),
)
@click.option(
    "--config-file",
    required=True,
    type=click.Path(exists=True),
)
@click.option(
    "--output",
    required=False,
    type=click.Path(),
)
def submit_to_loculus(metadata, sequences, mode, log_level, config_file, output):
    """
    Submit data to Loculus.
    """
    logging.basicConfig(level=log_level)
    with open(config_file) as file:
        full_config = yaml.safe_load(file)
        relevant_config = {key: full_config[key] for key in Config.__annotations__}
        config = Config(**relevant_config)

    if mode == "submit":
        logging.info("Submitting to Loculus")
        logging.debug(f"Config: {config}")
        # Create group if it doesn't exist
        group_id = get_group_id(config)

        # Submit
        logging.info("Starting submission")
        response = submit(metadata, sequences, config, group_id)
        logging.info("Submission complete")

    if mode == "approve":
        while True:
            logging.info("Approving sequences")
            response = approve(config)
            logging.debug(f"Approved: {response}")
            sleep(10)

    if mode == "get-submitted":
        logging.info("Getting submitted sequences")
        response = get_submitted(config)
        Path(output).write_text(json.dumps(response))
        logging.debug(f"Originally submitted: {response}")


if __name__ == "__main__":
    submit_to_loculus()
