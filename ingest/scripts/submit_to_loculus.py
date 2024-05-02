import logging
from dataclasses import dataclass
from time import sleep

import click
import requests
import yaml
import os

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

    keycloak_ingest_password = os.getenv("KEYCLOAK_INGEST_PASSWORD")
    if not keycloak_ingest_password:
        keycloak_ingest_password = config.password

    data = {
        "username": config.username,
        "password": keycloak_ingest_password,
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
    type=click.Choice(["submit", "approve"]),
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
def submit_to_loculus(metadata, sequences, mode, log_level, config_file):
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



if __name__ == "__main__":
    submit_to_loculus()
