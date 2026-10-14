#!/bin/sh
# Ends ArgoCD sync operations that would otherwise block cleanup of preview deployments.
#
# - Apps marked for deletion: any running sync is ended, whatever the app type.
#   ArgoCD only removes an app's resources once no operation is in progress.
# - Preview apps (matching PREVIEW_LABEL_SELECTOR): syncs running for longer than
#   MAX_PREVIEW_SYNC_SECONDS are ended.
# - All other apps are left alone.
#
# A sync is ended the same way `argocd app terminate-op` does it: by setting
# .status.operationState.phase to Terminating. If an app that is being deleted still
# has an operation on a later run (i.e. termination didn't go through), /operation is
# removed directly, which lets ArgoCD go ahead with deleting the app.
set -eu

NAMESPACE="${ARGOCD_NAMESPACE:-argocd}"
PREVIEW_LABEL_SELECTOR="${PREVIEW_LABEL_SELECTOR:-loculus/deployment-type=preview}"
MAX_PREVIEW_SYNC_SECONDS="${MAX_PREVIEW_SYNC_SECONDS:-1800}"
DRY_RUN="${DRY_RUN:-false}"

log() {
    echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) $*"
}

patch_app() {
    app="$1"
    patch_type="$2"
    patch="$3"
    if [ "$DRY_RUN" = "true" ]; then
        log "[dry run] would patch application ${app} (${patch_type}): ${patch}"
        return 0
    fi
    kubectl patch application "$app" -n "$NAMESPACE" --type "$patch_type" -p "$patch" >/dev/null ||
        log "Failed to patch application ${app}"
}

terminate_sync() {
    app="$1"
    reason="$2"
    log "Terminating sync of ${app}: ${reason}"
    patch_app "$app" merge \
        "{\"status\":{\"operationState\":{\"phase\":\"Terminating\",\"message\":\"Terminated by argocd-stuck-sync-reaper: ${reason}\"}}}"
}

remove_operation() {
    app="$1"
    reason="$2"
    log "Removing operation from ${app}: ${reason}"
    patch_app "$app" json '[{"op":"remove","path":"/operation"}]'
}

seconds_since() {
    timestamp="$1"
    started=$(date -u -d "$timestamp" -D "%Y-%m-%dT%H:%M:%SZ" +%s 2>/dev/null || date -u -d "$timestamp" +%s)
    echo $(($(date -u +%s) - started))
}

preview_apps=$(kubectl get applications -n "$NAMESPACE" -l "$PREVIEW_LABEL_SELECTOR" \
    -o go-template='{{range .items}}{{.metadata.name}}{{"\n"}}{{end}}')

# One line per app: name, deleting, has operation, phase, startedAt ("-" if missing)
apps=$(kubectl get applications -n "$NAMESPACE" -o go-template='{{range .items -}}
{{.metadata.name}} {{if .metadata.deletionTimestamp}}yes{{else}}no{{end}} {{if .operation}}yes{{else}}no{{end}} {{with .status}}{{with .operationState}}{{or .phase "-"}} {{or .startedAt "-"}}{{else}}- -{{end}}{{else}}- -{{end}}
{{end}}')

echo "$apps" | while read -r name deleting has_operation phase started_at; do
    # Without .operation, ArgoCD isn't syncing (a "Running" phase is then just stale status)
    if [ -z "$name" ] || [ "$has_operation" != "yes" ]; then
        continue
    fi

    if [ "$deleting" = "yes" ]; then
        if [ "$phase" = "Running" ]; then
            terminate_sync "$name" "application is being deleted"
        else
            remove_operation "$name" "application is being deleted (operation phase: ${phase})"
        fi
        continue
    fi

    if ! echo "$preview_apps" | grep -qxF "$name"; then
        continue
    fi

    if [ "$phase" = "Running" ] && [ "$started_at" != "-" ]; then
        running_for=$(seconds_since "$started_at")
        if [ "$running_for" -gt "$MAX_PREVIEW_SYNC_SECONDS" ]; then
            terminate_sync "$name" "preview sync has been running for ${running_for}s (limit ${MAX_PREVIEW_SYNC_SECONDS}s)"
        fi
    elif [ "$phase" = "Terminating" ]; then
        log "Warning: sync of preview ${name} is still terminating"
    fi
done

log "Done"
