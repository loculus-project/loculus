#!/usr/bin/env python3

import argparse
import json
import subprocess
import time


def main(timeout=480):
    wait_for_generated_secrets(timeout)

    end_time = time.time() + timeout

    while True:
        pods = get_pods()

        if time.time() > end_time:
            print("Aborting, timeout reached")
            exit(1)

        try:
            if all_pods_are_ready(pods):
                print("All pods are up and running!")
                break
        except KeyError as e:
            print("KeyError:", e, "continuing...")

        print("Sleeping for 5 seconds...")
        time.sleep(5)


def wait_for_generated_secrets(timeout):
    # The secret generator (mittwald chart 3.4.1) publishes no Ready condition on
    # StringSecret; status.secret is only set once the generated Secret exists, so
    # that field is the reconciled signal. Without this wait, a generator failure
    # keeps every dependent pod in Init:CreateContainerConfigError until the pod
    # wait times out, and the cause is only visible in the generator's logs.
    result = subprocess.run(
        ["kubectl", "get", "stringsecrets", "-o", "json"],
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        # No CRD means nothing will ever be generated; let the pod wait report it.
        print("Could not list StringSecrets:", result.stderr.strip())
        return

    names = [item["metadata"]["name"] for item in json.loads(result.stdout)["items"]]
    if not names:
        return

    print("Waiting for generated secrets:", ", ".join(names))
    for name in names:
        result = subprocess.run(
            [
                "kubectl",
                "wait",
                f"--for=jsonpath={{.status.secret.name}}={name}",
                f"stringsecret/{name}",
                f"--timeout={timeout}s",
            ],
            capture_output=True,
            text=True,
        )
        if result.returncode != 0:
            print(
                f"Secret generator never reconciled StringSecret '{name}'; "
                "pods depending on it cannot start:",
                result.stderr.strip(),
            )
            exit(1)


def get_pods():
    cmd = ["kubectl", "get", "pods", "-l", "app=loculus", "-o", "json"]
    result = subprocess.run(cmd, capture_output=True, text=True)
    return json.loads(result.stdout)["items"]


def all_pods_are_ready(pods):
    for pod in pods:
        print("Status of:", pod["metadata"]["name"], "-", pod["status"]["phase"])
        if pod["status"]["phase"] == "Succeeded":
            continue
        if has_container_that_is_not_ready(pod):
            return False
    return True


def has_container_that_is_not_ready(pod):
    for container_status in pod["status"]["containerStatuses"]:
        if container_status["ready"] is False:
            print(container_status["name"], "is not ready")
            return True
    return False


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Wait for pods to be ready")
    parser.add_argument("--timeout", type=int, default=480, help="Timeout in seconds")
    args = parser.parse_args()
    main(timeout=args.timeout)
