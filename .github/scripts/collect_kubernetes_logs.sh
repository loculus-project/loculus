#!/bin/bash

set -e

pods=$(kubectl get pods -l app=loculus -n loculus -o jsonpath='{.items[*].metadata.name}' || true)
for pod in $pods; do
  containers=$(kubectl get pod "$pod" -n loculus -o jsonpath='{.spec.containers[*].name}' || true)
  for container in $containers; do
    mkdir "kubernetes_logs" -p
    file="kubernetes_logs/$pod-$container.txt"
    echo "Logs from $pod - $container:" >> "$file"
    kubectl logs "$pod" -n loculus -c "$container" >> "$file" 2>/dev/null || true
  done
done
