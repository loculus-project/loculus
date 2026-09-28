"""Disposable preview fixture, using public test accounts and normal backend APIs."""

import json
import os
import time
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

INGEST_NAME = "Automated Ingest from INSDC/NCBI Virus by Loculus"
BACKEND = os.environ.get("BACKEND_URL", "http://loculus-backend-service:8079")
TOKEN_URL = os.environ.get(
    "TOKEN_URL",
    "http://loculus-keycloak-service:8083/realms/loculus/protocol/openid-connect/token",
)


def request(url, method="GET", data=None, token=None, form=False):
    headers = {}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    if data is not None:
        headers["Content-Type"] = (
            "application/x-www-form-urlencoded" if form else "application/json"
        )
        data = (urlencode(data) if form else json.dumps(data)).encode()
    with urlopen(Request(url, data=data, headers=headers, method=method), timeout=30) as response:
        body = response.read()
        return json.loads(body) if body else None


def token(username):
    return request(TOKEN_URL, "POST", {
        "grant_type": "password", "client_id": "backend-client",
        "username": username, "password": username,
    }, form=True)["access_token"]


def seed(name):
    admin = token("superuser")
    groups = request(f"{BACKEND}/groups", token=admin)
    ingest = next((group for group in groups if group["groupId"] == 1), None)
    if ingest is None:
        if groups:
            raise RuntimeError("Group 1 is missing from a non-empty database; refusing to seed")
        return False
    if ingest["groupName"] != INGEST_NAME:
        raise RuntimeError("Group 1 is not the expected ingestion group; refusing to seed")
    matches = [group for group in groups if group["groupName"] == name]
    if len(matches) > 1 or (matches and matches[0]["groupId"] != 2):
        raise RuntimeError("Contributor fixture has unexpected IDs; refusing to seed")
    if not matches:
        if len(groups) != 1:
            raise RuntimeError("Other groups already exist; refusing to seed group 2")
        group = request(f"{BACKEND}/groups", "POST", {
            "groupName": name, "institution": "Synthetic preview testing",
            "address": {"line1": "Test only", "line2": "", "city": "Test",
                        "state": "", "postalCode": "00000", "country": "Switzerland"},
            "contactEmail": "testcontributor@void.o",
        }, token=admin)
        if group["groupId"] != 2:
            raise RuntimeError("Allocated group ID was not 2; stop and inspect preview")
    memberships = request(f"{BACKEND}/user/groups", token=token("testcontributor"))
    if not any(group["groupId"] == 2 for group in memberships):
        request(f"{BACKEND}/groups/2/users/testcontributor", "PUT", token=admin)
    memberships = request(f"{BACKEND}/user/groups", token=token("testcontributor"))
    if not any(group["groupId"] == 2 for group in memberships):
        raise RuntimeError("Contributor membership verification failed")
    print("Verified ingestion group 1 and testcontributor membership in group 2", flush=True)
    return True


def main():
    deadline = time.monotonic() + 1500
    while time.monotonic() < deadline:
        try:
            if seed(os.environ["GROUP_NAME"]):
                return
            print("Waiting for ingestion to create group 1", flush=True)
        except HTTPError as error:
            if error.code not in (401, 502, 503, 504):
                raise RuntimeError(f"Fixture API returned HTTP {error.code}") from None
            print(f"Waiting for services: HTTP {error.code}", flush=True)
        except (URLError, TimeoutError):
            print("Waiting for services", flush=True)
        time.sleep(10)
    raise RuntimeError("Timed out waiting for preview fixture prerequisites")


if __name__ == "__main__":
    main()
