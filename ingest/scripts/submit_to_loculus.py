import click
import json
import requests
import logging

BRANCH="mpox-with-processing"
GROUP_NAME="insdc_ingest_group"
USERNAME="insdc_ingest_user"
PASSWORD="insdc_ingest_user"
KEYCLOAK_TOKEN_URL=f"https://authentication.{BRANCH}.preview.k3s.loculus.org/realms/loculusRealm/protocol/openid-connect/token"
KEYCLOAK_CLIENT_ID="test-cli" # Apparently required to be exactly this
ORGANISM="mpox"

# Create the ingest user on instance start in kubernetes/loculus/templates/keycloak-config-map.yaml

def get_jwt(username, password):
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

    response = requests.post(KEYCLOAK_TOKEN_URL, data=data, headers=headers)
    response.raise_for_status()

    jwt_keycloak = response.json()
    jwt = jwt_keycloak['access_token']
    return jwt

def create_group(group_name):
    # Create the ingest group
    url = f"https://backend.{BRANCH}.preview.k3s.loculus.org/groups"
    token = get_jwt(USERNAME, PASSWORD)
    group_name = group_name

    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json"
    }

    data = {
        "groupName": group_name
    }

    response = requests.post(url, json=data, headers=headers)

    if response.status_code == 409:
        print("Group already exists")
    # raise if not 409 and not happy 2xx
    elif not response.ok:
        response.raise_for_status()

def submit(metadata, sequences):
    """
    Submit data to Loculus.
    """

    jwt = get_jwt(USERNAME, PASSWORD)

    # Endpoint URL
    url = f'https://backend.{BRANCH}.preview.k3s.loculus.org/{ORGANISM}/submit'

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
        'groupName': GROUP_NAME
    }

    # POST request
    response = requests.post(url, headers=headers, files=files, params=params)
    response.raise_for_status()

    # Closing files
    files['metadataFile'].close()
    files['sequenceFile'].close()

    return response.json()

def approve():
    """
    Get sequences that were preprocessed successfully and approve them.
    1. Get the ids of the sequences that were preprocessed successfully
        /ORGANISM/get-sequences-of-user
    2. Approve the sequences
    """
    jwt = get_jwt(USERNAME, PASSWORD)

    url = f'https://backend.{BRANCH}.preview.k3s.loculus.org/{ORGANISM}/get-sequences-of-user'


    # Headers with Bearer Authentication
    headers = {
        'Authorization': f'Bearer {jwt}'
    }


    # POST request
    response = requests.get(url, headers=headers)
    response.raise_for_status()

    # Get sequences to approve
    # Roughly of this shape:  {'accession': '182', 'version': 1, 'status': 'AWAITING_APPROVAL', 'isRevocation': False},
    to_approve = []
    for sequence in response.json():
        # Get sequences where status is AWAITING_APPROVAL
        # Approve them by adding them to list with {'accession': '182', 'version': 1}
        if sequence['status'] == 'AWAITING_APPROVAL':
            to_approve.append({'accession': sequence['accession'], 'version': sequence['version']})

    payload = {"accessionVersions": to_approve}

    url = f'https://backend.{BRANCH}.preview.k3s.loculus.org/{ORGANISM}/approve-processed-data'

    response = requests.post(url, headers=headers, json=payload)
    response.raise_for_status()

    return to_approve





    # Submit


# %%

@click.command()
@click.option('--metadata', required=False, type=click.Path(exists=True), help='Path to the metadata file')
@click.option('--sequences', required=False, type=click.Path(exists=True), help='Path to the sequences file')
@click.option('--output-ids', required=False, type=click.Path(), help='Path to the output IDs file')
@click.option('--mode', required=True, type=click.Choice(['submit', 'approve']), help='Mode to run in')
@click.option('--log-level', default='INFO', type=click.Choice(['DEBUG', 'INFO', 'WARNING', 'ERROR', 'CRITICAL']), help='Log level')
# @click.option('--submit-config', required=True, type=click.Path(exists=True), help='Path to the submit configuration file')
# def submit_to_loculus(metadata, sequences, submit_config, output_ids):
def submit_to_loculus(metadata, sequences, output_ids, mode, log_level):
    """
    Submit data to Loculus.
    """
    logging.basicConfig(level=log_level)
    if mode == 'submit':
        logging.info(f"Submitting to Loculus")
        logging.debug(f"Args: {metadata}, {sequences}, {output_ids}")
        # Create group if it doesn't exist
        logging.info(f"Creating group {GROUP_NAME}")
        create_group(GROUP_NAME)
        logging.info(f"Group {GROUP_NAME} created")

        # Submit
        logging.info(f"Starting submission")
        response = submit(metadata, sequences)
        logging.info(f"Submission complete")

        json.dump(response, open(output_ids, 'w'), indent=4)
        logging.info(f"IDs written to {output_ids}")
    
    if mode == 'approve':
        logging.info(f"Approving sequences")
        response = approve()
        logging.debug(f"Approved: {response}")

        logging.info(f"Approving sequences complete")
    

if __name__ == '__main__':
    submit_to_loculus()