#!/bin/bash

set -e

collect_logs() {
  local selector=$1
  local pods
  pods=$(kubectl get pods -l "$selector" -o jsonpath='{.items[*].metadata.name}' || true)

  echo "Collecting logs from pods: $pods"

  for pod in $pods; do
    containers=$(kubectl get pod "$pod" -o jsonpath='{.spec.containers[*].name}' || true)
    for container in $containers; do
      mkdir "kubernetes_logs" -p
      file="kubernetes_logs/$pod-$container.txt"
      echo "Logs from $pod - $container:" >> "$file"
      kubectl logs "$pod" -c "$container" >> "$file" 2>/dev/null || true
    done
  done
}

collect_logs app=loculus

# The secret generator does not carry the app=loculus label, but when it fails to
# generate a secret every pod depending on it is stuck in Init:CreateContainerConfigError
# and its reconcile errors are the only place the cause is visible.
collect_logs app.kubernetes.io/name=kubernetes-secret-generator
