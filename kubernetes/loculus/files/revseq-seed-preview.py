import argparse
import json
import logging
import mimetypes
import time
import uuid
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

LOG = logging.getLogger(__name__)
ORGANISMS = ("hmpv", "hpiv", "influenza-a", "rsv", "sars-cov-2", "seasonal-coronavirus")


def parse_args():
    parser = argparse.ArgumentParser(description="Seed a ReVSeq preview with flat upload files.")
    parser.add_argument("--backend-url", default="http://loculus-backend-service:8079")
    parser.add_argument(
        "--keycloak-token-url",
        default="http://loculus-keycloak-service:8083/realms/loculus/protocol/openid-connect/token",
    )
    parser.add_argument(
        "--raw-base-url", default="https://raw.githubusercontent.com/loculus-project/loculus"
    )
    parser.add_argument("--raw-branch", default="revseq")
    parser.add_argument("--username", default="testuser")
    parser.add_argument("--password", default="testuser")
    parser.add_argument("--group-name", default="ReVSeq preview data")
    parser.add_argument("--poll-seconds", type=int, default=900)
    parser.add_argument("--poll-interval-seconds", type=int, default=10)
    parser.add_argument("--work-dir", type=Path, default=Path("/tmp/revseq-seed"))
    parser.add_argument("--log-level", default="INFO")
    return parser.parse_args()


def request_json(url, method="GET", token=None, body=None, headers=None, timeout=60):
    data = None if body is None else json.dumps(body).encode("utf-8")
    request_headers = {"Accept": "application/json", **(headers or {})}
    if body is not None:
        request_headers["Content-Type"] = "application/json"
    if token is not None:
        request_headers["Authorization"] = f"Bearer {token}"
    request = Request(url, data=data, method=method, headers=request_headers)
    response = request_with_retry(request, timeout=timeout)
    payload = response.read().decode("utf-8")
    return json.loads(payload) if payload else None


def request_text(url, token=None, timeout=60):
    headers = {}
    if token is not None:
        headers["Authorization"] = f"Bearer {token}"
    request = Request(url, headers=headers)
    response = request_with_retry(request, timeout=timeout)
    return response.read().decode("utf-8")


def request_with_retry(request, timeout=60, attempts=30):
    last_error = None
    for attempt in range(1, attempts + 1):
        try:
            return urlopen(request, timeout=timeout)
        except (HTTPError, URLError, TimeoutError) as error:
            last_error = error
            status = getattr(error, "code", "network")
            if attempt == attempts or status in {400, 401, 403, 404, 409, 422}:
                raise
            LOG.info(
                "Waiting for %s (%s/%s, status: %s)", request.full_url, attempt, attempts, status
            )
            time.sleep(min(30, attempt * 2))
    raise RuntimeError(f"Request failed: {request.full_url}") from last_error


def token(args):
    form = urlencode(
        {
            "grant_type": "password",
            "client_id": "backend-client",
            "username": args.username,
            "password": args.password,
        }
    ).encode("utf-8")
    request = Request(
        args.keycloak_token_url,
        data=form,
        method="POST",
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    response = request_with_retry(request)
    return json.loads(response.read().decode("utf-8"))["access_token"]


def raw_url(args, file_name):
    return f"{args.raw_base_url.rstrip('/')}/{args.raw_branch}/test-data/{file_name}"


def download_test_data(args):
    args.work_dir.mkdir(parents=True, exist_ok=True)
    for organism in ORGANISMS:
        for suffix in ("metadata.tsv", "sequences.fasta"):
            file_name = f"{organism}-{suffix}"
            destination = args.work_dir / file_name
            if destination.exists():
                continue
            LOG.info("Downloading %s", file_name)
            destination.write_text(request_text(raw_url(args, file_name)), encoding="utf-8")


def existing_group_id(args, access_token):
    query = urlencode({"name": args.group_name})
    groups = request_json(f"{args.backend_url}/groups?{query}", token=access_token)
    for group in groups:
        if group.get("groupName") == args.group_name:
            return group["groupId"]
    return None


def create_group(args, access_token):
    group_id = existing_group_id(args, access_token)
    if group_id is not None:
        LOG.info("Using existing group %s", group_id)
        return group_id

    group = request_json(
        f"{args.backend_url}/groups",
        method="POST",
        token=access_token,
        body={
            "groupName": args.group_name,
            "institution": "ReVSeq preview",
            "address": {
                "line1": "Preview",
                "line2": "",
                "city": "Basel",
                "state": "",
                "postalCode": "0000",
                "country": "Switzerland",
            },
            "contactEmail": "noreply@loculus.org",
        },
    )
    LOG.info("Created group %s", group["groupId"])
    return group["groupId"]


def get_sequences(args, access_token, organism, group_id):
    query = urlencode({"groupIdsFilter": group_id})
    return request_json(f"{args.backend_url}/{organism}/get-sequences?{query}", token=access_token)


def sequence_entries(args, access_token, organism, group_id):
    response = get_sequences(args, access_token, organism, group_id)
    return response.get("sequenceEntries", [])


def submit_organism(args, access_token, organism, group_id):
    metadata_path = args.work_dir / f"{organism}-metadata.tsv"
    sequences_path = args.work_dir / f"{organism}-sequences.fasta"
    fields = {
        "groupId": str(group_id),
        "metadataFile": metadata_path,
        "sequenceFile": sequences_path,
    }
    body, content_type = encode_multipart(fields)
    request = Request(
        f"{args.backend_url}/{organism}/submit",
        data=body,
        method="POST",
        headers={
            "Authorization": f"Bearer {access_token}",
            "Content-Type": content_type,
            "Accept": "application/json",
        },
    )
    response = request_with_retry(request, timeout=300)
    submitted = json.loads(response.read().decode("utf-8"))
    LOG.info("Submitted %s entries for %s", len(submitted), organism)


def encode_multipart(fields):
    boundary = f"----revseq-{uuid.uuid4().hex}"
    body = bytearray()
    for name, value in fields.items():
        body.extend(f"--{boundary}\r\n".encode("utf-8"))
        if isinstance(value, Path):
            mime_type = mimetypes.guess_type(value.name)[0] or "application/octet-stream"
            body.extend(
                (
                    f'Content-Disposition: form-data; name="{name}"; filename="{value.name}"\r\n'
                    f"Content-Type: {mime_type}\r\n\r\n"
                ).encode("utf-8")
            )
            body.extend(value.read_bytes())
            body.extend(b"\r\n")
        else:
            body.extend(
                f'Content-Disposition: form-data; name="{name}"\r\n\r\n{value}\r\n'.encode("utf-8")
            )
    body.extend(f"--{boundary}--\r\n".encode("utf-8"))
    return bytes(body), f"multipart/form-data; boundary={boundary}"


def wait_for_processing(args, access_token, organism, group_id):
    deadline = time.time() + args.poll_seconds
    while time.time() < deadline:
        entries = sequence_entries(args, access_token, organism, group_id)
        statuses = {entry.get("status") for entry in entries}
        if entries and not statuses.intersection({"RECEIVED", "IN_PROCESSING"}):
            LOG.info("%s preprocessing finished with statuses: %s", organism, sorted(statuses))
            return entries
        LOG.info("%s preprocessing statuses: %s", organism, sorted(statuses))
        time.sleep(args.poll_interval_seconds)
    raise TimeoutError(f"Timed out waiting for preprocessing of {organism}")


def fail_on_processing_errors(organism, entries):
    failed = [entry for entry in entries if entry.get("processingResult") == "HAS_ERRORS"]
    if not failed:
        return

    for entry in failed[:5]:
        accession = entry.get("accession", "<unknown>")
        LOG.error("%s %s preprocessing errors: %s", organism, accession, entry.get("errors", []))
    extra = len(failed) - 5
    if extra > 0:
        LOG.error("%s has %s additional entries with preprocessing errors", organism, extra)
    raise RuntimeError(f"{organism} preprocessing produced errors for {len(failed)} entries")


def approve_organism(args, access_token, organism, group_id):
    request_json(
        f"{args.backend_url}/{organism}/approve-processed-data",
        method="POST",
        token=access_token,
        body={"groupIdsFilter": [group_id], "scope": "ALL"},
    )
    LOG.info("Approved processed entries for %s", organism)


def main():
    args = parse_args()
    logging.basicConfig(
        level=getattr(logging, args.log_level.upper()), format="%(levelname)s %(message)s"
    )
    access_token = token(args)
    group_id = create_group(args, access_token)
    download_test_data(args)

    for organism in ORGANISMS:
        entries = sequence_entries(args, access_token, organism, group_id)
        if not entries:
            submit_organism(args, access_token, organism, group_id)
        else:
            LOG.info(
                "%s already has %s submitted entries in group %s", organism, len(entries), group_id
            )

        entries = wait_for_processing(args, access_token, organism, group_id)
        fail_on_processing_errors(organism, entries)
        statuses = {entry.get("status") for entry in entries}
        if "PROCESSED" in statuses:
            approve_organism(args, access_token, organism, group_id)
        else:
            LOG.info(
                "%s has no newly processed entries to approve; statuses: %s",
                organism,
                sorted(statuses),
            )


if __name__ == "__main__":
    main()
