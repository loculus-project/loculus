import click
import json

#%%
"""
Script to create the ingest user and group on a loculus server
"""
import requests

BRANCH="mpox-rebased"
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
    print(json.dumps(response.json(), indent=4))

    # Closing files
    files['metadataFile'].close()
    files['sequenceFile'].close()

    response.raise_for_status()




    # Submit


# %%

@click.command()
@click.option('--metadata', required=True, type=click.Path(exists=True), help='Path to the metadata file')
@click.option('--sequences', required=True, type=click.Path(exists=True), help='Path to the sequences file')
# @click.option('--submit-config', required=True, type=click.Path(exists=True), help='Path to the submit configuration file')
# @click.option('--output-ids', required=True, type=click.Path(), help='Path to the output IDs file')
# def submit_to_loculus(metadata, sequences, submit_config, output_ids):
def submit_to_loculus(metadata, sequences):
    """
    Submit data to Loculus.
    """
    # Create group if it doesn't exist
    create_group(GROUP_NAME)

    # Submit
    submit(metadata, sequences)
    

if __name__ == '__main__':
    submit_to_loculus()
