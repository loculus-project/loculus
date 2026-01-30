#!/usr/bin/env python3

import argparse
import json
import subprocess
import time


def main(timeout=480):
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
