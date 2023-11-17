#!/bin/bash

set -e

pods=$(kubectl get pods -l app=pathoplexus -n pathoplexus -o jsonpath='{.items[*].metadata.name}' || true)
for pod in $pods; do
  containers=$(kubectl get pod "$pod" -n pathoplexus -o jsonpath='{.spec.containers[*].name}' || true)
  for container in $containers; do
    echo "Logs from $pod - $container:" >> kubernetes_logs.txt
    kubectl logs "$pod" -n pathoplexus -c "$container" >> kubernetes_logs.txt 2>/dev/null || true
    echo "==============================" >> kubernetes_logs.txt
  done
done
