#!/bin/bash

set -e

mkdir -p "kubernetes_logs"

# Collect logs for a single container. When $previous is "true" the logs of the
# previously terminated instance are collected instead of the current one. These
# only exist when a container has restarted (e.g. CrashLoopBackOff), so failures
# are expected and the (otherwise empty) file is removed afterwards.
#
# NOTE: `kubectl logs --previous` only exposes the immediately previous (n-1)
# instance. Earlier instances (n-2, n-3, ...) are not reachable via kubectl. To
# capture *every* restart we additionally copy the kubelet's per-restart log
# files (0.log, 1.log, ...) straight off the k3d node; see collect_node_pod_logs.
collect_container_logs() {
  namespace="$1"
  pod="$2"
  container="$3"
  previous="$4"

  if [ "$previous" = "true" ]; then
    file="kubernetes_logs/$namespace-$pod-$container-previous.txt"
    header="Previous (pre-restart) logs from $namespace/$pod - $container:"
    previous_flag="--previous"
  else
    file="kubernetes_logs/$namespace-$pod-$container.txt"
    header="Logs from $namespace/$pod - $container:"
    previous_flag=""
  fi

  # Self-describing header: node, image and restart count so each log file is
  # interpretable on its own without cross-referencing pods.yaml.
  node=$(kubectl get pod "$pod" -n "$namespace" -o jsonpath='{.spec.nodeName}' 2>/dev/null || true)
  uid=$(kubectl get pod "$pod" -n "$namespace" -o jsonpath='{.metadata.uid}' 2>/dev/null || true)
  restarts=$(kubectl get pod "$pod" -n "$namespace" -o jsonpath="{.status.containerStatuses[?(@.name=='$container')].restartCount}{.status.initContainerStatuses[?(@.name=='$container')].restartCount}" 2>/dev/null || true)
  image=$(kubectl get pod "$pod" -n "$namespace" -o jsonpath="{.status.containerStatuses[?(@.name=='$container')].imageID}{.status.initContainerStatuses[?(@.name=='$container')].imageID}" 2>/dev/null || true)
  {
    echo "$header"
    echo "  node=$node podUID=$uid restartCount=$restarts"
    echo "  image=$image"
    echo "---"
  } > "$file"

  # --timestamps prepends an RFC3339 timestamp (from the container runtime) to
  # every line, independent of the app's own log format. This is essential for
  # correlating pod logs with the backend log, the Playwright network trace and
  # pod events when debugging timing/ordering issues.
  # shellcheck disable=SC2086 # previous_flag is intentionally unquoted (may be empty)
  kubectl logs --timestamps=true "$pod" -n "$namespace" -c "$container" $previous_flag >> "$file" 2>/dev/null || true

  # Drop the file if it only contains the header (no previous instance existed).
  if [ "$(wc -l < "$file")" -le 4 ]; then
    rm -f "$file"
  fi
}

# Collect current + previous (n-1) logs for every container of every pod matching
# a label selector in a namespace.
collect_pods() {
  namespace="$1"
  selector="$2"
  pods=$(kubectl get pods -n "$namespace" -l "$selector" -o jsonpath='{.items[*].metadata.name}' || true)
  echo "Collecting logs from $namespace pods ($selector): $pods"
  for pod in $pods; do
    # Include init containers so crashes during initialisation are captured too.
    containers=$(kubectl get pod "$pod" -n "$namespace" -o jsonpath='{.spec.initContainers[*].name} {.spec.containers[*].name}' || true)
    for container in $containers; do
      collect_container_logs "$namespace" "$pod" "$container" "false"
      collect_container_logs "$namespace" "$pod" "$container" "true"
    done
  done
}

# Copy the kubelet's per-restart log files off every k3d node. This captures the
# logs of ALL container instances (0.log = first, 1.log = second, ...) for ALL
# pods in ALL namespaces, i.e. everything kubectl's n-1 limit hides, plus proxy /
# system components. Best-effort: only runs when the cluster is k3d (node = docker
# container) and docker is available.
collect_node_pod_logs() {
  command -v docker >/dev/null 2>&1 || return 0
  nodes=$(docker ps --filter "name=k3d-" --format '{{.Names}}' | grep -vE 'serverlb|registry' || true)
  for node in $nodes; do
    dest="kubernetes_logs/node-logs/$node"
    mkdir -p "$dest"
    # /var/log/pods holds <ns>_<pod>_<uid>/<container>/<restart>.log for every instance.
    docker cp "$node:/var/log/pods" "$dest/pods" 2>/dev/null || true
  done
}

# Application pods.
collect_pods "default" "app=loculus"
# Traefik ingress (kube-system) — the proxy in front of backend/LAPIS/website.
# Its logs (and access logs, if enabled) explain "CORS"-looking failures that are
# really upstream 502/503s returned without CORS headers.
collect_pods "kube-system" "app.kubernetes.io/name=traefik"
# Everything, every restart, straight off the node.
collect_node_pod_logs
