import logging
from dataclasses import dataclass
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


def organism_url(config: Config):
    return f"{config.backend_url.rstrip('/')}/{config.organism.strip('/')}"


def get_jwt(config: Config):
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


def create_group(config: Config):
    # Create the ingest group
    url = f"{config.backend_url.rstrip('/')}/groups"
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

    response = requests.post(url, json=data, headers=headers)

    if response.status_code == 409:
        print("Group already exists")
    # raise if not 409 and not happy 2xx
    elif not response.ok:
        print(f"Error creating group: {response.json()}")
        response.raise_for_status()


def submit(metadata, sequences, config: Config):
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
        "groupName": config.group_name,
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
    Get sequences that were processed successfully and approve them.
    1. Get the ids of the sequences that were processed successfully
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
        logging.info(f"Creating group {config.group_name}")
        create_group(config)
        logging.info(f"Group {config.group_name} created")

        # Submit
        logging.info("Starting submission")
        response = submit(metadata, sequences, config)
        logging.info("Submission complete")

    if mode == "approve":
        while True:
            logging.info("Approving sequences")
            response = approve(config)
            logging.debug(f"Approved: {response}")
            sleep(10)



if __name__ == "__main__":
    submit_to_loculus()
