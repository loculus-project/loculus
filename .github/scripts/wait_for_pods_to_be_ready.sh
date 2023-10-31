#!/bin/bash

set -e

end=$((SECONDS+480))
while true; do
  all_pods=$(kubectl get pods -l app=pathoplexus -n pathoplexus -o jsonpath='{.items[*].metadata.name}')
  running_pods=$(kubectl get pods -l app=pathoplexus -n pathoplexus -o=jsonpath='{.items[?(@.status.phase=="Running")].metadata.name}')
  succeeded_pods=$(kubectl get pods -l app=pathoplexus -n pathoplexus -o=jsonpath='{.items[?(@.status.phase=="Succeeded")].metadata.name}')

  all_pods_sorted=$(echo "$all_pods" | tr " " "\n" | sort)
  running_and_succeeded_pods=$(echo "$running_pods $succeeded_pods" | tr " " "\n" | sort)

  if [[ "$all_pods_sorted" == "$running_and_succeeded_pods" ]]; then
    echo "All pods are up and running!"
    break
  fi

  if [[ "${SECONDS}" -ge "${end}" ]]; then
    echo "Error: The following pods did not start on time: $(diff <(echo "$all_pods_sorted") <(echo "$running_and_succeeded_pods"))"
    exit 1
  fi

  echo "Waiting for pods to be ready:"
  echo "$(diff <(echo "$all_pods_sorted") <(echo "$running_and_succeeded_pods"))"
  echo "Sleeping for 10 seconds..."
  sleep 10
done
