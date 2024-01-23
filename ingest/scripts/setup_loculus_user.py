#%%
"""
Script to create the ingest user and group on a loculus server
"""
import requests

GROUP_NAME="insdc_ingest_group"
USERNAME="insdc_ingest_user"
PASSWORD="insdc_ingest_user"
KEYCLOAK_TOKEN_URL="https://authentication.mpox-config.preview.k3s.loculus.org/realms/loculusRealm/protocol/openid-connect/token"
KEYCLOAK_CLIENT_ID="test-cli" # Apparently required to be exactly this

# Create the ingest user on instance start in kubernetes/loculus/templates/keycloak-config-map.yaml

# Authenticate the user

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
    url = "https://backend.mpox-config.preview.k3s.loculus.org/groups"
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
    response.raise_for_status()

# %%
create_group(GROUP_NAME)

# %%
