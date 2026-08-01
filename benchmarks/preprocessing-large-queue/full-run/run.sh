#!/usr/bin/env bash
set -Eeuo pipefail

HERE="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(git -C "$HERE" rev-parse --show-toplevel)"
SIZE="${1:-}"
started="$(date +%s)"
started_utc="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

if [[ "$#" -ne 1 || ! "$SIZE" =~ ^(100|500|1000)$ ]]; then
    echo "Usage: LOCULUS_BENCHMARK_DATASET_ROOT=/path/to/covid-datasets $0 100|500|1000" >&2
    exit 2
fi

CONTEXT="${LOCULUS_BENCHMARK_CONTEXT:-k3d-perfCovCluster}"
NAMESPACE="${LOCULUS_BENCHMARK_NAMESPACE:-default}"
RELEASE="${LOCULUS_BENCHMARK_HELM_RELEASE:-}"
DATASET_ROOT="${LOCULUS_BENCHMARK_DATASET_ROOT:-$REPO/.benchmark-data/covid}"
RESULTS_ROOT="${LOCULUS_BENCHMARK_RESULTS_ROOT:-$HERE/results}"
RUN_NAME="${LOCULUS_BENCHMARK_RUN_NAME:-}"
BACKEND_REPLICAS="${LOCULUS_BENCHMARK_BACKEND_REPLICAS:-1}"
PREPROCESSING_REPLICAS="${LOCULUS_BENCHMARK_PREPROCESSING_REPLICAS:-32}"
NEXTCLADE_JOBS="${LOCULUS_BENCHMARK_NEXTCLADE_JOBS:-4}"
PROCESS_TIMEOUT="${PROCESS_TIMEOUT:-14400}"
UPLOAD_TIMEOUT="${UPLOAD_TIMEOUT:-14400}"
LAPIS_TIMEOUT="${LAPIS_TIMEOUT:-3600}"
POLL_INTERVAL="${POLL_INTERVAL:-60}"
LAPIS_POLL_INTERVAL="${LAPIS_POLL_INTERVAL:-10}"
SAMPLE_INTERVAL="${SAMPLE_INTERVAL:-30}"
DATASET_READY_TIMEOUT="${DATASET_READY_TIMEOUT:-1200}"
SERVICE_READY_TIMEOUT="${SERVICE_READY_TIMEOUT:-1200}"
BACKEND_PORT="${LOCULUS_BENCHMARK_BACKEND_PORT:-18079}"
KEYCLOAK_PORT="${LOCULUS_BENCHMARK_KEYCLOAK_PORT:-18083}"
LAPIS_PORT="${LOCULUS_BENCHMARK_LAPIS_PORT:-18080}"

ORGANISM=sars-cov-2
BACKEND=loculus-backend
DATABASE=loculus-database
KEYCLOAK=loculus-keycloak
KEYCLOAK_DATABASE=loculus-keycloak-database
PREPROCESSING="loculus-preprocessing-$ORGANISM-v1-0"
SILO="loculus-silo-$ORGANISM"
LAPIS="loculus-lapis-$ORGANISM"
database_deployments=("$DATABASE" "$KEYCLOAK_DATABASE")
consumer_deployments=("$BACKEND" "$PREPROCESSING" "$KEYCLOAK" "$SILO" "$LAPIS")

say() {
    printf '[%s] %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*"
}
die() {
    failure_reason="$*"
    say "ERROR: $*" >&2
    exit 1
}
kube() {
    kubectl --context "$CONTEXT" --namespace "$NAMESPACE" "$@"
}
psql() {
    kube exec "deployment/$DATABASE" -c database -- \
        psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d loculus -F $'\t' -c "$1"
}

for tool in curl docker flock git helm jq k3d kubectl rsync sha256sum; do
    command -v "$tool" >/dev/null || die "missing command: $tool"
done
[[ "$CONTEXT" == k3d-* ]] || die "refusing to reset non-k3d context $CONTEXT"
[[ "$BACKEND_REPLICAS" =~ ^[1-9][0-9]*$ ]] || die "invalid backend replica count"
[[ "$PREPROCESSING_REPLICAS" =~ ^[1-9][0-9]*$ ]] || die "invalid preprocessing replica count"
[[ "$NEXTCLADE_JOBS" =~ ^[1-9][0-9]*$ ]] || die "invalid Nextclade job count"
[[ -z "$RUN_NAME" || "$RUN_NAME" =~ ^[a-zA-Z0-9._-]+$ ]] || die "invalid run name"
for value in "$PROCESS_TIMEOUT" "$UPLOAD_TIMEOUT" "$LAPIS_TIMEOUT" "$POLL_INTERVAL" \
    "$LAPIS_POLL_INTERVAL" "$SAMPLE_INTERVAL" "$DATASET_READY_TIMEOUT" "$SERVICE_READY_TIMEOUT"; do
    [[ "$value" =~ ^[1-9][0-9]*$ ]] || die "timeouts and intervals must be positive integers"
done
for port in "$BACKEND_PORT" "$KEYCLOAK_PORT" "$LAPIS_PORT"; do
    [[ "$port" =~ ^[1-9][0-9]*$ ]] && ((port <= 65535)) || die "invalid local port: $port"
done

lock_name="${CONTEXT//[^a-zA-Z0-9_.-]/_}-${NAMESPACE//[^a-zA-Z0-9_.-]/_}"
exec 9>"/tmp/loculus-large-queue-$lock_name.lock"
flock -n 9 || die "another benchmark is already using $CONTEXT/$NAMESPACE"

for deployment in "$BACKEND" "$DATABASE" "$KEYCLOAK" "$KEYCLOAK_DATABASE" "$PREPROCESSING" "$SILO" "$LAPIS"; do
    kube get "deployment/$deployment" >/dev/null || die "missing deployment/$deployment"
done
if [[ -z "$RELEASE" ]]; then
    RELEASE="$(kube get "deployment/$BACKEND" -o jsonpath='{.metadata.annotations.meta\.helm\.sh/release-name}')"
fi
[[ -n "$RELEASE" ]] || die "cannot determine Helm release"

for database in "$DATABASE" "$KEYCLOAK_DATABASE"; do
    kube get "deployment/$database" -o json | jq -e \
        '[.spec.template.spec.volumes[]? | select(has("persistentVolumeClaim") or has("hostPath"))] | length == 0' \
        >/dev/null || die "deployment/$database uses persistent storage"
done

row="$(awk -F $'\t' -v size="$SIZE" 'NR > 1 && $1 == size { print; exit }' "$HERE/inputs.tsv")"
[[ -n "$row" ]] || die "$SIZE is missing from inputs.tsv"
IFS=$'\t' read -r _ RECORDS EXPECTED_ERRORS fasta_path metadata_path fasta_hash metadata_hash <<<"$row"
FASTA="$DATASET_ROOT/$fasta_path"
METADATA="$DATASET_ROOT/$metadata_path"
[[ -r "$FASTA" && -r "$METADATA" ]] || die "dataset is missing below $DATASET_ROOT"
[[ "$(sha256sum "$FASTA" | awk '{print $1}')" == "$fasta_hash" ]] || die "wrong FASTA checksum"
[[ "$(sha256sum "$METADATA" | awk '{print $1}')" == "$metadata_hash" ]] || die "wrong metadata checksum"

source_paths=(
    backend
    preprocessing
    kubernetes
    benchmarks/preprocessing-large-queue
    ':(exclude)benchmarks/preprocessing-large-queue/full-run/results'
)
commit="$(git -C "$REPO" rev-parse HEAD)"
untracked_paths="$(git -C "$REPO" ls-files --others --exclude-standard -- "${source_paths[@]}")"
worktree_hash="$({
    git -C "$REPO" diff --binary HEAD -- "${source_paths[@]}"
    while IFS= read -r path
    do
        [[ -z "$path" ]] || sha256sum "$REPO/$path"
    done <<<"$untracked_paths"
} | sha256sum | awk '{print $1}')"
source_id="${commit:0:7}-${worktree_hash:0:12}"
tag="local-$source_id"
backend_image="loculus-benchmark-backend:$tag"
preprocessing_image="loculus-benchmark-preprocessing:$tag"

current_values="$(helm get values "$RELEASE" --kube-context "$CONTEXT" --namespace "$NAMESPACE" -o json)"
host="${LOCULUS_BENCHMARK_HOST:-$(jq -r '.host // "benchmark.localhost"' <<<"$current_values")}"
support_sha="${LOCULUS_BENCHMARK_SUPPORT_SHA:-$(jq -r '.sha // empty' <<<"$current_values")}"
support_sha="${support_sha:-$(git -C "$REPO" rev-parse --short=7 origin/main 2>/dev/null || echo "${commit:0:7}")}"
support_sha="${support_sha:0:7}"

RESULT="$RESULTS_ROOT/${RUN_NAME:-$source_id}/${SIZE}k-$(date -u +%Y%m%dT%H%M%SZ)"
TMP="$(mktemp -d /tmp/loculus-large-queue.XXXXXX)"
mkdir -p "$RESULT"
if ! git -C "$REPO" diff --quiet HEAD -- "${source_paths[@]}" || [[ -n "$untracked_paths" ]]; then
    git -C "$REPO" diff --binary HEAD -- "${source_paths[@]}" >"$RESULT/source.patch"
    while IFS= read -r path
    do
        [[ -z "$path" ]] || git -C "$REPO" diff --binary --no-index -- /dev/null "$path" \
            >>"$RESULT/source.patch" || true
    done <<<"$untracked_paths"
fi

failure_reason=""
collector_pid=""
forward_pids=()
release_applied=0
run_complete=0
db_stats_initialized=0
total=0
queued=0
active=0
processed_ok=0
processed_error=0
printf 'setup\n' >"$TMP/phase"
: >"$TMP/paused-deployments.tsv"
: >"$TMP/reset-deployments.tsv"

wait_scaled_down() {
    local deployment="$1" deadline="$(($(date +%s) + 600))" state generation observed replicas
    while :; do
        state="$(kube get "deployment/$deployment" -o json | jq -r '[.metadata.generation, (.status.observedGeneration // 0), (.status.replicas // 0)] | @tsv')"
        IFS=$'\t' read -r generation observed replicas <<<"$state"
        ((observed >= generation && replicas == 0)) && return
        (($(date +%s) < deadline)) || die "deployment/$deployment did not scale down"
        sleep 2
    done
}
wait_service() {
    local service="$1" deadline="$(($(date +%s) + SERVICE_READY_TIMEOUT))"
    while :; do
        kube get "endpoints/$service" -o json 2>/dev/null |
            jq -e '[.subsets[]?.addresses[]?] | length > 0' >/dev/null && return
        (($(date +%s) < deadline)) || die "service/$service has no ready endpoint"
        sleep 2
    done
}
wait_dataset() {
    local deadline="$(($(date +%s) + DATASET_READY_TIMEOUT))" pods ready pod hashes
    while :; do
        pods="$(kube get pods -l "component=$PREPROCESSING" -o json | jq '[.items[] | select(.status.phase == "Running")] | length')"
        ready="$(kube logs -l "component=$PREPROCESSING" --prefix --max-log-requests="$PREPROCESSING_REPLICAS" --tail=-1 2>/dev/null |
            grep 'Nextclade dataset downloaded successfully' | awk '{print $1}' | sort -u | wc -l || true)"
        if ((pods == PREPROCESSING_REPLICAS && ready >= PREPROCESSING_REPLICAS)); then
            pod="$(kube get pods -l "component=$PREPROCESSING" -o jsonpath='{.items[0].metadata.name}')"
            hashes="$(kube exec "$pod" -- sh -c '
                find /tmp -type f -name pathogen.json -exec sha256sum {} + | head -n1
                find /tmp -type f -name reference.fasta -exec sha256sum {} + | head -n1
            ' | awk '{print $1}' | tr '\n' ' ')"
            read -r pathogen_hash reference_hash <<<"$hashes"
            [[ "$pathogen_hash" =~ ^[0-9a-f]{64}$ && "$reference_hash" =~ ^[0-9a-f]{64}$ ]] && return
        fi
        (($(date +%s) < deadline)) || die "Nextclade dataset was not ready in all workers"
        sleep 10
    done
}
wait_forward() {
    local pid="$1" url="$2" log="$3"
    for _ in {1..120}; do
        kill -0 "$pid" 2>/dev/null || { tail -20 "$log" >&2; die "port-forward stopped before $url"; }
        curl -fsS --max-time 3 "$url" >/dev/null 2>&1 && return
        sleep 2
    done
    die "timed out waiting for $url"
}
write_auth_header() {
    local response
    for _ in {1..120}; do
        response="$(curl -sS --max-time 10 -X POST "http://127.0.0.1:$KEYCLOAK_PORT/realms/loculus/protocol/openid-connect/token" \
            -H 'Content-Type: application/x-www-form-urlencoded' \
            --data-urlencode "username=${LOCULUS_BENCHMARK_KEYCLOAK_USER:-superuser}" \
            --data-urlencode "password=${LOCULUS_BENCHMARK_KEYCLOAK_PASSWORD:-superuser}" \
            --data-urlencode 'grant_type=password' --data-urlencode 'client_id=backend-client' || true)"
        if jq -e '.access_token' >/dev/null 2>&1 <<<"$response"; then
            umask 077
            printf 'Authorization: Bearer %s\n' "$(jq -r '.access_token' <<<"$response")" >"$TMP/auth-header"
            return
        fi
        sleep 2
    done
    die "could not authenticate benchmark user"
}
initialize_db_stats() {
    printf 'phase\tquery_id\tcalls\ttotal_exec_time_ms\tmean_exec_time_ms\trows\tquery\n' >"$RESULT/pg-stat-statements.tsv"
    printf 'phase\toperation\tcalls\ttotal_exec_time_ms\trows\n' >"$TMP/db-operations.tsv"
}
capture_db_phase() {
    local phase="$1"
    psql "SELECT queryid,calls,round(total_exec_time::numeric,3),round(mean_exec_time::numeric,3),rows,left(regexp_replace(query,E'[\\n\\r\\t]+',' ','g'),1000) FROM pg_stat_statements WHERE dbid=(SELECT oid FROM pg_database WHERE datname=current_database()) ORDER BY total_exec_time DESC LIMIT 10" |
        awk -v phase="$phase" -F '\t' 'BEGIN {OFS=FS} {print phase,$0}' >>"$RESULT/pg-stat-statements.tsv"
    psql "WITH classified AS (SELECT CASE WHEN btrim(query) ~* '^UPDATE metadata_upload_aux_table' AND query ~* 'accession' THEN 'accession_assignment' WHEN btrim(query) ~* '^INSERT INTO data_use_terms_table' THEN 'data_use_terms' WHEN query ~* 'FOR UPDATE[[:space:]]+SKIP LOCKED' OR (btrim(query) ~* '^SELECT sequence_entries[.]accession' AND query ~* 'NOT EXISTS') OR (btrim(query) ~* '^INSERT INTO sequence_entries_preprocessed_data' AND query ~* 'ON CONFLICT') THEN 'queue_claim' WHEN query ~* '\\mprocessed_data\\M[[:space:]]*=' THEN 'result_store' WHEN btrim(query) ~* '^INSERT INTO table_update_tracker' THEN 'tracker' END AS operation,calls,total_exec_time,rows FROM pg_stat_statements) SELECT operation,SUM(calls),round(SUM(total_exec_time)::numeric,3),SUM(rows) FROM classified WHERE operation IS NOT NULL GROUP BY operation ORDER BY SUM(total_exec_time) DESC" |
        awk -v phase="$phase" -F '\t' 'BEGIN {OFS=FS} {print phase,$0}' >>"$TMP/db-operations.tsv"
}
snapshot() {
    psql "WITH target AS (SELECT accession,version FROM sequence_entries WHERE organism='$ORGANISM' AND NOT is_revocation), work AS (SELECT count(*) FILTER (WHERE p.processing_status='IN_PROCESSING') AS active,count(*) FILTER (WHERE p.processing_status='PROCESSED' AND (p.errors IS NULL OR jsonb_array_length(p.errors)=0)) AS processed_ok,count(*) FILTER (WHERE p.processing_status='PROCESSED' AND p.errors IS NOT NULL AND jsonb_array_length(p.errors)>0) AS processed_error,max(p.finished_processing_at) AS finished_at FROM target t JOIN sequence_entries_preprocessed_data p USING (accession,version) JOIN current_processing_pipeline c ON c.organism='$ORGANISM' AND c.version=p.pipeline_version) SELECT count(*),greatest(count(*)-w.active-w.processed_ok-w.processed_error,0),w.active,w.processed_ok,w.processed_error,coalesce(floor(extract(epoch FROM w.finished_at))::bigint,0) FROM target,work w GROUP BY w.active,w.processed_ok,w.processed_error,w.finished_at"
}
collect_resources() {
    local memory pod_json backend_restarts preprocessing_ready preprocessing_restarts
    while :; do
        memory="$(kube top pods -l component=backend --no-headers 2>/dev/null | awk '{v=$3; if(v~/Gi$/){sub(/Gi$/,"",v);v*=1024}else if(v~/Mi$/){sub(/Mi$/,"",v)}else if(v~/Ki$/){sub(/Ki$/,"",v);v/=1024}else{next}; total+=v;seen=1} END{print seen?total:"NA"}')"
        pod_json="$(kube get pods -l component=backend -o json 2>/dev/null || true)"
        backend_restarts="$(jq '[.items[].status.containerStatuses[]?.restartCount] | add // "NA"' <<<"$pod_json" 2>/dev/null || echo NA)"
        pod_json="$(kube get pods -l "component=$PREPROCESSING" -o json 2>/dev/null || true)"
        preprocessing_ready="$(jq '[.items[] | select(any(.status.containerStatuses[]?; .ready))] | length' <<<"$pod_json" 2>/dev/null || echo NA)"
        preprocessing_restarts="$(jq '[.items[].status.containerStatuses[]?.restartCount] | add // "NA"' <<<"$pod_json" 2>/dev/null || echo NA)"
        printf '%s\t%s\t%s\t%s\t%s\t%s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$(<"$TMP/phase")" "$memory" "$backend_restarts" "$preprocessing_ready" "$preprocessing_restarts" >>"$TMP/resources.tsv"
        sleep "$SAMPLE_INTERVAL"
    done
}
on_error() { [[ -n "$failure_reason" ]] || failure_reason="line $1: $2"; }
cleanup() {
    local exit_code=$?
    trap - ERR
    set +e
    [[ -z "$collector_pid" ]] || kill "$collector_pid" 2>/dev/null
    for pid in "${forward_pids[@]:-}"; do kill "$pid" 2>/dev/null; done
    wait 2>/dev/null
    for series in stages.tsv resources.tsv; do [[ -s "$TMP/$series" ]] && cp "$TMP/$series" "$RESULT/$series"; done
    if ((exit_code != 0 && !run_complete)); then
        ((db_stats_initialized)) && capture_db_phase "$(<"$TMP/phase")-failed" >/dev/null 2>&1
        jq -n --arg source "$source_id" --arg commit "$commit" --arg phase "$(<"$TMP/phase")" --arg reason "${failure_reason:-unexpected command failure}" --argjson records "$RECORDS" --argjson command_seconds "$(($(date +%s) - started))" --argjson total "$total" --argjson queued "$queued" --argjson active "$active" --argjson processed_ok "$processed_ok" --argjson processed_error "$processed_error" '{result:"FAILED",source:{id:$source,commit:$commit},records:$records,phase:$phase,reason:$reason,command_seconds:$command_seconds,last_observed:{total:$total,queued:$queued,active:$active,processed_ok:$processed_ok,processed_error:$processed_error}}' >"$RESULT/summary.json"
        say "FAILED $RESULT"
    fi
    while IFS=$'\t' read -r deployment replicas; do [[ -n "$deployment" ]] && kube scale "deployment/$deployment" --replicas="$replicas" >/dev/null 2>&1; done <"$TMP/paused-deployments.tsv"
    if ((exit_code != 0 && release_applied)); then
        while IFS=$'\t' read -r deployment replicas; do [[ -n "$deployment" ]] && kube scale "deployment/$deployment" --replicas="$replicas" >/dev/null 2>&1; done <"$TMP/reset-deployments.tsv"
    fi
    case "$TMP" in /tmp/loculus-large-queue.*) rm -rf -- "$TMP" ;; esac
    return "$exit_code"
}
trap 'on_error "$LINENO" "$BASH_COMMAND"' ERR
trap cleanup EXIT

say "Building local images from $source_id"
mkdir -p "$TMP/backend" "$TMP/artifact" "$TMP/runtime/build/libs"
rsync -a --exclude build --exclude .gradle "$REPO/backend/" "$TMP/backend/"
docker buildx build --target artifact --output "type=local,dest=$TMP/artifact" --file "$HERE/backend.Dockerfile" "$TMP/backend"
cp "$TMP/artifact/backend.jar" "$TMP/runtime/build/libs/backend.jar"
cp "$REPO/backend/Dockerfile" "$REPO/backend/entrypoint.sh" "$TMP/runtime/"
docker build --tag "$backend_image" "$TMP/runtime"
docker build --tag "$preprocessing_image" "$REPO/preprocessing/nextclade"
k3d image import --cluster "${CONTEXT#k3d-}" "$backend_image" "$preprocessing_image"

helm upgrade "$RELEASE" "$REPO/kubernetes/loculus" --kube-context "$CONTEXT" --namespace "$NAMESPACE" --reset-values -f "$HERE/values.yaml" --set-string "host=$host" --set-string "sha=$support_sha" --set images.backend.repository=loculus-benchmark-backend --set-string "images.backend.tag=$tag" --set images.backend.pullPolicy=IfNotPresent --set imagePullPolicy=IfNotPresent --set "replicas.backend=$BACKEND_REPLICAS" --set "defaultOrganisms.$ORGANISM.preprocessing[0].image=loculus-benchmark-preprocessing" --set-string "defaultOrganisms.$ORGANISM.preprocessing[0].dockerTag=$tag" --set "defaultOrganisms.$ORGANISM.preprocessing[0].replicas=$PREPROCESSING_REPLICAS" --set "defaultOrganisms.$ORGANISM.preprocessing[0].configFile.nextclade_jobs=$NEXTCLADE_JOBS"
release_applied=1

kube get deployments -o json | jq -r --arg preprocessing "$PREPROCESSING" '.items[] | select(.metadata.name | startswith("loculus-preprocessing-")) | select(.metadata.name != $preprocessing and (.spec.replicas // 0) > 0) | [.metadata.name,.spec.replicas] | @tsv' >"$TMP/paused-deployments.tsv"
while IFS=$'\t' read -r deployment _; do [[ -n "$deployment" ]] && kube scale "deployment/$deployment" --replicas=0; done <"$TMP/paused-deployments.tsv"
while IFS=$'\t' read -r deployment _; do [[ -n "$deployment" ]] && wait_scaled_down "$deployment"; done <"$TMP/paused-deployments.tsv"

for deployment in "${database_deployments[@]}" "${consumer_deployments[@]}"; do
    replicas="$(kube get "deployment/$deployment" -o jsonpath='{.spec.replicas}')"
    [[ "$deployment" == "$BACKEND" ]] && replicas="$BACKEND_REPLICAS"
    [[ "$deployment" == "$PREPROCESSING" ]] && replicas="$PREPROCESSING_REPLICAS"
    [[ "$replicas" == 0 ]] && replicas=1
    printf '%s\t%s\n' "$deployment" "$replicas" >>"$TMP/reset-deployments.tsv"
done
for deployment in "${consumer_deployments[@]}"; do kube scale "deployment/$deployment" --replicas=0; done
for deployment in "${consumer_deployments[@]}"; do wait_scaled_down "$deployment"; done
for deployment in "${database_deployments[@]}"; do kube scale "deployment/$deployment" --replicas=0; done
for deployment in "${database_deployments[@]}"; do wait_scaled_down "$deployment"; done
while IFS=$'\t' read -r deployment replicas; do [[ "$deployment" != "$PREPROCESSING" ]] && kube scale "deployment/$deployment" --replicas="$replicas"; done <"$TMP/reset-deployments.tsv"
for service in loculus-backend-service loculus-keycloak-service "loculus-lapis-service-$ORGANISM"; do wait_service "$service"; done
while IFS=$'\t' read -r deployment replicas; do [[ "$deployment" == "$PREPROCESSING" ]] && kube scale "deployment/$deployment" --replicas="$replicas"; done <"$TMP/reset-deployments.tsv"
wait_dataset
preprocessing_config_hash="$(kube get "configmap/loculus-preprocessing-config-$ORGANISM-v1-0" -o json | jq -r '.data["preprocessing-config.yaml"]' | sha256sum | awk '{print $1}')"
nextclade_tag="$(kube get "configmap/loculus-preprocessing-config-$ORGANISM-v1-0" -o json | jq -r '.data["preprocessing-config.yaml"]' | awk '/nextclade_dataset_tag:/ {gsub(/["\047]/,"",$2); print $2; exit}')"
[[ -n "$nextclade_tag" ]] || die "values.yaml must pin nextclade_dataset_tag"
backend_memory_limit="$(kube get "deployment/$BACKEND" -o json | jq -r '.spec.template.spec.containers[] | select(.name == "backend") | .resources.limits.memory // ""')"
database_memory_limit="$(kube get "deployment/$DATABASE" -o json | jq -r '.spec.template.spec.containers[] | select(.name == "database") | .resources.limits.memory // ""')"
other_loculus_pods="$(kubectl --context "$CONTEXT" get pods --all-namespaces -o json | jq --arg namespace "$NAMESPACE" '[.items[] | select(.metadata.namespace != $namespace and .status.phase == "Running" and (.metadata.labels.app // "") == "loculus")] | length')"

for spec in "loculus-backend-service $BACKEND_PORT:8079 backend" "loculus-keycloak-service $KEYCLOAK_PORT:8083 keycloak" "loculus-lapis-service-$ORGANISM $LAPIS_PORT:8080 lapis"; do
    read -r service ports name <<<"$spec"
    kubectl --context "$CONTEXT" --namespace "$NAMESPACE" port-forward "service/$service" "$ports" --address=127.0.0.1 >"$TMP/$name-port-forward.log" 2>&1 9>&- &
    forward_pids+=("$!")
done
wait_forward "${forward_pids[0]}" "http://127.0.0.1:$BACKEND_PORT/actuator/health/readiness" "$TMP/backend-port-forward.log"
wait_forward "${forward_pids[1]}" "http://127.0.0.1:$KEYCLOAK_PORT/realms/loculus/.well-known/openid-configuration" "$TMP/keycloak-port-forward.log"
wait_forward "${forward_pids[2]}" "http://127.0.0.1:$LAPIS_PORT/sample/aggregated" "$TMP/lapis-port-forward.log"

write_auth_header
group="$(curl -sS --fail --max-time 60 -X POST "http://127.0.0.1:$BACKEND_PORT/groups" -H "@$TMP/auth-header" -H 'Content-Type: application/json' --data-binary '{"groupName":"large-queue-benchmark","institution":"Loculus benchmark","address":{"line1":"test","line2":"","city":"Basel","state":"","postalCode":"4051","country":"Switzerland"},"contactEmail":"benchmark@example.invalid"}')"
group_id="$(jq -r '.groupId' <<<"$group")"
[[ "$group_id" =~ ^[1-9][0-9]*$ ]] || die "could not create benchmark group"
[[ "$(psql "SELECT count(*) FROM sequence_entries WHERE organism='$ORGANISM'")" == 0 ]] || die "database is not empty after reset"
initialize_db_stats
db_stats_initialized=1
psql 'SELECT pg_stat_statements_reset()' >/dev/null

printf 'timestamp\tphase\tbackend_memory_mib\tbackend_restarts\tpreprocessing_ready\tpreprocessing_restarts\n' >"$TMP/resources.tsv"
printf 'submit\n' >"$TMP/phase"
collect_resources 9>&- &
collector_pid=$!

say "Submitting $RECORDS records"
run_started="$(date +%s)"
set +e
curl -sS --max-time "$UPLOAD_TIMEOUT" -o /dev/null -w '%{http_code}\t%{time_total}\n' -X POST "http://127.0.0.1:$BACKEND_PORT/$ORGANISM/submit?groupId=$group_id&dataUseTermsType=OPEN" -H "@$TMP/auth-header" -F "sequenceFile=@$FASTA" -F "metadataFile=@$METADATA" >"$TMP/submission.tsv" 2>"$TMP/submission.stderr"
submit_rc=$?
set -e
read -r submit_http upload_seconds <"$TMP/submission.tsv"
if [[ "$submit_rc" -ne 0 || ! "$submit_http" =~ ^2[0-9][0-9]$ ]]; then
    tail -20 "$TMP/submission.stderr" >&2
    die "submission failed: curl=$submit_rc HTTP=${submit_http:-000}"
fi

printf 'timestamp\telapsed_s\ttotal\tremaining\tactive\tprocessed_ok\tprocessed_error\tfinished_epoch\n' >"$TMP/stages.tsv"
printf 'queue-drain\n' >"$TMP/phase"
drain_started="$(date +%s)"
deadline="$((drain_started + PROCESS_TIMEOUT))"
first_snapshot=1
while :; do
    now="$(date +%s)"
    state="$(snapshot)"
    IFS=$'\t' read -r total queued active processed_ok processed_error finished_epoch <<<"$state"
    if ((first_snapshot)); then
        processed_at_upload_complete="$((processed_ok + processed_error))"
        remaining_at_upload_complete="$((total - processed_at_upload_complete))"
        queued_at_upload_complete="$queued"
        active_at_upload_complete="$active"
        capture_db_phase upload
        psql 'SELECT pg_stat_statements_reset()' >/dev/null
        first_snapshot=0
    fi
    printf '%s\t%s\t%s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$((now - drain_started))" "$state" >>"$TMP/stages.tsv"
    say "queued=$queued active=$active ok=$processed_ok errors=$processed_error"
    [[ "$total" == "$RECORDS" ]] || die "database contains $total rows, expected $RECORDS"
    if ((processed_ok + processed_error == total)); then
        ((finished_epoch > 0)) || die "processed rows have no completion timestamp"
        if [[ "$EXPECTED_ERRORS" != - && "$processed_error" != "$EXPECTED_ERRORS" ]]; then
            die "processing produced $processed_error errors, expected $EXPECTED_ERRORS"
        fi
        capture_db_phase queue_drain
        psql 'SELECT pg_stat_statements_reset()' >/dev/null
        drain_seconds="$((finished_epoch > drain_started ? finished_epoch - drain_started : 0))"
        to_processed_seconds="$((finished_epoch - run_started))"
        break
    fi
    ((now < deadline)) || die "preprocessing timed out"
    sleep "$POLL_INTERVAL"
done

printf 'approve\n' >"$TMP/phase"
approval_started="$(date +%s)"
write_auth_header
approve_http="$(curl -sS --max-time 1800 -o "$TMP/approval.json" -w '%{http_code}' -X POST "http://127.0.0.1:$BACKEND_PORT/$ORGANISM/approve-processed-data" -H "@$TMP/auth-header" -H 'Content-Type: application/json' --data-binary "{\"scope\":\"ALL\",\"groupIdsFilter\":[$group_id]}")"
[[ "$approve_http" =~ ^2[0-9][0-9]$ ]] || die "approval failed: HTTP $approve_http"
approved="$(jq 'length' "$TMP/approval.json")"
((approved == processed_ok)) || die "approval took $approved of $processed_ok records"
approval_seconds="$(($(date +%s) - approval_started))"

printf 'lapis\n' >"$TMP/phase"
lapis_started="$(date +%s)"
deadline="$(($(date +%s) + LAPIS_TIMEOUT))"
lapis_count=0
while ((lapis_count < processed_ok)); do
    lapis_count="$(curl -sS --max-time 30 "http://127.0.0.1:$LAPIS_PORT/sample/aggregated" 2>/dev/null | jq -r '.data[0].count // 0' 2>/dev/null || echo 0)"
    [[ "$lapis_count" =~ ^[0-9]+$ ]] || lapis_count=0
    (($(date +%s) < deadline)) || die "LAPIS timed out at $lapis_count/$processed_ok"
    ((lapis_count >= processed_ok)) || sleep "$LAPIS_POLL_INTERVAL"
done
finished="$(date +%s)"
lapis_seconds="$((finished - lapis_started))"
capture_db_phase publication

kill "$collector_pid" 2>/dev/null || true
wait "$collector_pid" 2>/dev/null || true
collector_pid=""
cp "$TMP/stages.tsv" "$RESULT/stages.tsv"
cp "$TMP/resources.tsv" "$RESULT/resources.tsv"

numeric='^[0-9]+([.][0-9]+)?$'
resource_samples="$(awk 'NR > 1 { n++ } END { print n + 0 }' "$TMP/resources.tsv")"
memory_samples="$(awk -F '\t' -v numeric="$numeric" 'NR > 1 && $3 ~ numeric { n++ } END { print n + 0 }' "$TMP/resources.tsv")"
backend_status_samples="$(awk -F '\t' -v numeric="$numeric" 'NR > 1 && $4 ~ numeric { n++ } END { print n + 0 }' "$TMP/resources.tsv")"
preprocessing_status_samples="$(awk -F '\t' -v numeric="$numeric" 'NR > 1 && $5 ~ numeric && $6 ~ numeric { n++ } END { print n + 0 }' "$TMP/resources.tsv")"
peak_memory="$(awk -F '\t' -v numeric="$numeric" 'NR > 1 && $3 ~ numeric { if (!seen++ || $3 > max) max = $3 } END { print seen ? max : 0 }' "$TMP/resources.tsv")"
backend_restarts_start="$(awk -F '\t' -v numeric="$numeric" 'NR > 1 && $4 ~ numeric && !seen++ { value = $4 } END { print seen ? value : 0 }' "$TMP/resources.tsv")"
backend_restarts_end="$(awk -F '\t' -v numeric="$numeric" 'NR > 1 && $4 ~ numeric { value = $4; seen = 1 } END { print seen ? value : 0 }' "$TMP/resources.tsv")"
backend_restarts_max="$(awk -F '\t' -v numeric="$numeric" 'NR > 1 && $4 ~ numeric { if (!seen++ || $4 > max) max = $4 } END { print seen ? max : 0 }' "$TMP/resources.tsv")"
preprocessing_restarts_start="$(awk -F '\t' -v numeric="$numeric" 'NR > 1 && $6 ~ numeric && !seen++ { value = $6 } END { print seen ? value : 0 }' "$TMP/resources.tsv")"
preprocessing_restarts_end="$(awk -F '\t' -v numeric="$numeric" 'NR > 1 && $6 ~ numeric { value = $6; seen = 1 } END { print seen ? value : 0 }' "$TMP/resources.tsv")"
preprocessing_restarts_max="$(awk -F '\t' -v numeric="$numeric" 'NR > 1 && $6 ~ numeric { if (!seen++ || $6 > max) max = $6 } END { print seen ? max : 0 }' "$TMP/resources.tsv")"
preprocessing_ready_min="$(awk -F '\t' -v numeric="$numeric" 'NR > 1 && $5 ~ numeric { if (!seen++ || $5 < min) min = $5 } END { print seen ? min : 0 }' "$TMP/resources.tsv")"
backend_restarts_delta="$((backend_restarts_max - backend_restarts_start))"
preprocessing_restarts_delta="$((preprocessing_restarts_max - preprocessing_restarts_start))"
quality=VALID
if ((
    memory_samples < resource_samples ||
        backend_status_samples < resource_samples ||
        preprocessing_status_samples < resource_samples ||
        backend_restarts_delta > 0 ||
        preprocessing_restarts_delta > 0 ||
        preprocessing_ready_min < PREPROCESSING_REPLICAS
)); then
    quality=DEGRADED
fi
database_operations="$(jq -Rn '
    [
      inputs
      | split("\t")
      | select(.[0] != "phase" and length >= 5)
      | {
          phase: .[0],
          operation: .[1],
          calls: (.[2] | tonumber),
          total_exec_time_ms: (.[3] | tonumber),
          rows: (.[4] | tonumber)
        }
    ]
' <"$TMP/db-operations.tsv")"

jq -n \
    --arg source "$source_id" \
    --arg commit "$commit" \
    --arg worktree_hash "$worktree_hash" \
    --arg support_sha "$support_sha" \
    --arg host "$host" \
    --arg started_utc "$started_utc" \
    --arg finished_utc "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
    --arg fasta_path "$fasta_path" \
    --arg metadata_path "$metadata_path" \
    --arg fasta_hash "$fasta_hash" \
    --arg metadata_hash "$metadata_hash" \
    --arg pathogen_hash "$pathogen_hash" \
    --arg reference_hash "$reference_hash" \
    --arg nextclade_tag "$nextclade_tag" \
    --arg preprocessing_config_hash "$preprocessing_config_hash" \
    --arg backend_memory_limit "$backend_memory_limit" \
    --arg database_memory_limit "$database_memory_limit" \
    --arg expected_errors "$EXPECTED_ERRORS" \
    --arg quality "$quality" \
    --argjson records "$RECORDS" \
    --argjson upload_seconds "$upload_seconds" \
    --argjson processed_at_upload_complete "$processed_at_upload_complete" \
    --argjson remaining_at_upload_complete "$remaining_at_upload_complete" \
    --argjson queued_at_upload_complete "$queued_at_upload_complete" \
    --argjson active_at_upload_complete "$active_at_upload_complete" \
    --argjson drain_seconds "$drain_seconds" \
    --argjson to_processed_seconds "$to_processed_seconds" \
    --argjson processed_ok "$processed_ok" \
    --argjson processed_error "$processed_error" \
    --argjson approved "$approved" \
    --argjson approval_seconds "$approval_seconds" \
    --argjson lapis_seconds "$lapis_seconds" \
    --argjson lapis_count "$lapis_count" \
    --argjson setup_seconds "$((run_started - started))" \
    --argjson workload_seconds "$((finished - run_started))" \
    --argjson command_seconds "$(($(date +%s) - started))" \
    --argjson peak_memory_mib "$peak_memory" \
    --argjson memory_samples "$memory_samples" \
    --argjson resource_samples "$resource_samples" \
    --argjson backend_status_samples "$backend_status_samples" \
    --argjson preprocessing_status_samples "$preprocessing_status_samples" \
    --argjson backend_restarts_start "$backend_restarts_start" \
    --argjson backend_restarts_end "$backend_restarts_end" \
    --argjson backend_restarts_delta "$backend_restarts_delta" \
    --argjson preprocessing_restarts_start "$preprocessing_restarts_start" \
    --argjson preprocessing_restarts_end "$preprocessing_restarts_end" \
    --argjson preprocessing_restarts_delta "$preprocessing_restarts_delta" \
    --argjson preprocessing_ready_min "$preprocessing_ready_min" \
    --argjson backend_replicas "$BACKEND_REPLICAS" \
    --argjson preprocessing_replicas "$PREPROCESSING_REPLICAS" \
    --argjson nextclade_jobs "$NEXTCLADE_JOBS" \
    --argjson other_loculus_pods "$other_loculus_pods" \
    --argjson database_operations "$database_operations" \
    '{
      result: "COMPLETE",
      quality: $quality,
      source: {
        id: $source,
        commit: $commit,
        worktree_hash: $worktree_hash,
        support_sha: $support_sha
      },
      started_utc: $started_utc,
      finished_utc: $finished_utc,
      host: $host,
      records: $records,
      input: {
        fasta: {path: $fasta_path, sha256: $fasta_hash},
        metadata: {path: $metadata_path, sha256: $metadata_hash},
        expected_errors: (if $expected_errors == "-" then null else ($expected_errors | tonumber) end)
      },
      configuration: {
        backend_replicas: $backend_replicas,
        preprocessing_replicas: $preprocessing_replicas,
        nextclade_jobs: $nextclade_jobs,
        other_loculus_pods: $other_loculus_pods,
        memory_limits: {
          backend: $backend_memory_limit,
          database: $database_memory_limit
        },
        preprocessing_config_sha256: $preprocessing_config_hash,
        nextclade_dataset: {
          tag: $nextclade_tag,
          pathogen_json_sha256: $pathogen_hash,
          reference_fasta_sha256: $reference_hash
        }
      },
      upload: {
        seconds: $upload_seconds,
        rows_per_second: ($records / $upload_seconds)
      },
      at_upload_complete: {
        processed: $processed_at_upload_complete,
        remaining: $remaining_at_upload_complete,
        queued: $queued_at_upload_complete,
        active: $active_at_upload_complete
      },
      queue_drain: {
        seconds: $drain_seconds,
        records: $remaining_at_upload_complete,
        rows_per_second: (
          if $drain_seconds > 0 then $remaining_at_upload_complete / $drain_seconds else null end
        )
      },
      to_processed: {
        seconds: $to_processed_seconds,
        processed_ok: $processed_ok,
        processed_error: $processed_error,
        effective_rows_per_second: (
          if $to_processed_seconds > 0 then $records / $to_processed_seconds else null end
        )
      },
      publication: {
        approval_seconds: $approval_seconds,
        approved: $approved,
        lapis_seconds: $lapis_seconds,
        lapis_count: $lapis_count
      },
      evidence: {
        resource_samples: $resource_samples,
        memory_samples: $memory_samples,
        backend_status_samples: $backend_status_samples,
        preprocessing_status_samples: $preprocessing_status_samples
      },
      setup_seconds: $setup_seconds,
      workload_seconds: $workload_seconds,
      command_seconds: $command_seconds,
      backend_memory: {
        peak_mib: (if $memory_samples > 0 then $peak_memory_mib else null end),
        samples: $memory_samples
      },
      preprocessing: {
        replicas: $preprocessing_replicas,
        ready_min: $preprocessing_ready_min
      },
      restarts: {
        backend_start: $backend_restarts_start,
        backend_end: $backend_restarts_end,
        backend_delta: $backend_restarts_delta,
        preprocessing_start: $preprocessing_restarts_start,
        preprocessing_end: $preprocessing_restarts_end,
        preprocessing_delta: $preprocessing_restarts_delta
      },
      database_operations: $database_operations
    }' >"$RESULT/summary.json"

run_complete=1
say "COMPLETE $RESULT"
