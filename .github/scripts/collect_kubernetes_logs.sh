#!/bin/bash

set -e

mkdir -p kubernetes_logs

# Traefik is in kube-system; --tail=-1 because a selector defaults to 10 lines
kubectl logs -n kube-system -l app.kubernetes.io/name=traefik --tail=-1 \
  > kubernetes_logs/traefik.txt 2>/dev/null || true

pods=$(kubectl get pods -l app=loculus -o jsonpath='{.items[*].metadata.name}' || true)

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
