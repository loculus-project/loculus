#!/usr/bin/env python3

import argparse
import json
import subprocess
import time


def main(timeout=480):
    end_time = time.time() + timeout

    while True:
        pods = get_pods()


        try:
            not_ready_pods = not_ready_pod_names(pods)
            if len(not_ready_pod_names) == 0:
                print("All pods are up and running!")
                break

            if time.time() > end_time:
                print("Aborting, timeout reached.")
                print_debug_info(not_ready_pods)
                exit(1)
        except KeyError as e:
            print("KeyError:", e, "continuing...")

        print("Sleeping for 5 seconds...")
        time.sleep(5)


def get_pods():
    cmd = ["kubectl", "get", "pods", "-l", "app=loculus", "-o", "json"]
    result = subprocess.run(cmd, capture_output=True, text=True)
    return json.loads(result.stdout)["items"]


def print_debug_info(pod_names):
    print("\nFetching events for more details...\n")
    for pod_name in pod_names:
        subprocess.run(["kubectl", "get", "events", "--field-selector involvedObject.name=" + pod_name, "--sort-by=.metadata.creationTimestamp"], text=True)


def not_ready_pod_names(pods):
    names = []
    for pod in pods:
        if "silo-import-cronjob" in pod["metadata"]["name"]:
            continue
        print("Status of:", pod["metadata"]["name"], "-", pod["status"]["phase"])
        if pod["status"]["phase"] == "Succeeded":
            continue
        if has_container_that_is_not_ready(pod):
            names.append(pod["metadata"]["name"])
    return names


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
