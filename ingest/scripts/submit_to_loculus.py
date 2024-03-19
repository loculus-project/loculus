import json
import logging

import click
import requests

BRANCH="demo-prepro"
GROUP_NAME="insdc_ingest_group"
USERNAME="insdc_ingest_user"
PASSWORD="insdc_ingest_user"
BACKEND_URL=f"https://backend-{BRANCH}.loculus.org"
KEYCLOAK_TOKEN_URL=f"https://authentication-{BRANCH}.loculus.org/realms/loculusRealm/protocol/openid-connect/token"
KEYCLOAK_CLIENT_ID="test-cli" # Apparently required to be exactly this
ORGANISM="mpox"

# Create the ingest user on instance start in kubernetes/loculus/templates/keycloak-config-map.yaml

def backend_url(branch):
    return f"https://backend-{branch}.loculus.org"

def get_jwt(username, password, branch):
    """
    Get a JWT token for the given username and password
    """

    data = {
        "username": username,
        "password": password,
        "grant_type": "password",
        "client_id": KEYCLOAK_CLIENT_ID,
    }
    headers = {'Content-Type': 'application/x-www-form-urlencoded'}

    keycloak_token_url = f"https://authentication-{branch}.loculus.org/realms/loculus/protocol/openid-connect/token"

    response = requests.post(keycloak_token_url, data=data, headers=headers)
    response.raise_for_status()

    jwt_keycloak = response.json()
    jwt = jwt_keycloak['access_token']
    return jwt

def create_group(group_name, branch):
    # Create the ingest group
    url = f"{backend_url(branch)}/groups"
    token = get_jwt(USERNAME, PASSWORD, branch)
    group_name = group_name

    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json"
    }

    data = {
        "groupName": group_name,
        "institution": "NA",
        "address": {
          "line1": "1234 Loculus Street",
          "line2": "NA",
          "city": "Dortmund",
          "state": "NRW",
          "postalCode": "12345",
          "country": "Germany"
        },
        "contactEmail": "something@loculus.org"
    }

    response = requests.post(url, json=data, headers=headers)

    if response.status_code == 409:
        print("Group already exists")
    # raise if not 409 and not happy 2xx
    elif not response.ok:
        print(f"Error creating group: {response.json()}")
        response.raise_for_status()

def submit(metadata, sequences, branch):
    """
    Submit data to Loculus.
    """

    jwt = get_jwt(USERNAME, PASSWORD, branch)

    # Endpoint URL
    url = f'{backend_url(branch)}/{ORGANISM}/submit'

    # Headers with Bearer Authentication
    headers = {
        'Authorization': f'Bearer {jwt}'
    }

    # Files to be uploaded
    files = {
        'metadataFile': open(metadata, 'rb'),
        'sequenceFile': open(sequences, 'rb')
    }

    # Query parameters
    params = {
        'groupName': GROUP_NAME,
        "dataUseTermsType": "OPEN",
    }

    # POST request
    response = requests.post(url, headers=headers, files=files, params=params)
    response.raise_for_status()

    # Closing files
    files['metadataFile'].close()
    files['sequenceFile'].close()

    return response.json()

def approve(branch):
    """
    Get sequences that were preprocessed successfully and approve them.
    1. Get the ids of the sequences that were preprocessed successfully
        /ORGANISM/get-sequences
    2. Approve the sequences
    """
    jwt = get_jwt(USERNAME, PASSWORD, branch)

    url = f'{backend_url(branch)}/{ORGANISM}/get-sequences'


    # Headers with Bearer Authentication
    headers = {
        'Authorization': f'Bearer {jwt}'
    }


    # POST request
    response = requests.get(url, headers=headers)
    response.raise_for_status()

    # logging.info(f"Response: {response.json()}")

    # # Get sequences to approve
    # # Roughly of this shape:  {'accession': '182', 'version': 1, 'status': 'AWAITING_APPROVAL', 'isRevocation': False},
    # to_approve = []
    # for sequence in response.json()["sequenceEntries"]:
    #     # Get sequences where status is AWAITING_APPROVAL
    #     # Approve them by adding them to list with {'accession': '182', 'version': 1}
    #     if sequence['status'] == 'AWAITING_APPROVAL':
    #         to_approve.append({'accession': sequence['accession'], 'version': sequence['version']})

    payload = {"scope": "ALL"}

    url = f'{backend_url(branch)}/{ORGANISM}/approve-processed-data'

    response = requests.post(url, headers=headers, json=payload)
    response.raise_for_status()


# %%

@click.command()
@click.option('--metadata', required=False, type=click.Path(exists=True), help='Path to the metadata file')
@click.option('--sequences', required=False, type=click.Path(exists=True), help='Path to the sequences file')
@click.option('--branch', required=False, type=click.STRING, help='Branch to submit to', default="main")
@click.option('--output-ids', required=False, type=click.Path(), help='Path to the output IDs file')
@click.option('--mode', required=True, type=click.Choice(['submit', 'approve']), help='Mode to run in')
@click.option('--log-level', default='INFO', type=click.Choice(['DEBUG', 'INFO', 'WARNING', 'ERROR', 'CRITICAL']), help='Log level')
# @click.option('--submit-config', required=True, type=click.Path(exists=True), help='Path to the submit configuration file')
# def submit_to_loculus(metadata, sequences, submit_config, output_ids):
def submit_to_loculus(metadata, sequences, branch: str, output_ids, mode, log_level):
    """
    Submit data to Loculus.
    """
    logging.basicConfig(level=log_level)
    if mode == 'submit':
        logging.info("Submitting to Loculus")
        logging.debug(f"Args: {metadata}, {sequences}, {output_ids}")
        # Create group if it doesn't exist
        logging.info(f"Creating group {GROUP_NAME}")
        create_group(GROUP_NAME, branch)
        logging.info(f"Group {GROUP_NAME} created")

        # Submit
        logging.info("Starting submission")
        response = submit(metadata, sequences, branch)
        logging.info("Submission complete")

        json.dump(response, open(output_ids, 'w'), indent=4)
        logging.info(f"IDs written to {output_ids}")
    
    if mode == 'approve':
        logging.info("Approving sequences")
        response = approve(branch)
        logging.debug(f"Approved: {response}")

        logging.info("Approving sequences complete")
    

if __name__ == '__main__':
    submit_to_loculus()
