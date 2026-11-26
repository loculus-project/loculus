#!/bin/bash

set -e

namespaces="default"

mkdir -p kubernetes_logs

for namespace in $namespaces; do
  pods=$(kubectl get pods -n "$namespace" -o jsonpath='{.items[*].metadata.name}' || true)
  echo "Collecting logs from pods in $namespace: $pods"

  for pod in $pods; do
    containers=$(kubectl get pod "$pod" -n "$namespace" -o jsonpath='{.spec.initContainers[*].name} {.spec.containers[*].name}' || true)
    for container in $containers; do
      file="kubernetes_logs/$pod-$container.txt"
      echo "Logs from $pod - $container:" > "$file"
      kubectl logs "$pod" -n "$namespace" -c "$container" >> "$file" 2>/dev/null || true

      # A restarted container's cause is usually in the log of the instance that died.
      if previous=$(kubectl logs "$pod" -n "$namespace" -c "$container" --previous 2>/dev/null); then
        { echo "Previous logs from $pod - $container:"; echo "$previous"; } > "kubernetes_logs/$pod-$container-previous.txt"
      fi
    done
  done
done
