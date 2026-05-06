{{/*
Shared pod spec for the per-organism ingest workload, used by both the
scheduled CronJob and the manually-triggered revoke-and-regroup CronJob.
The labels and lock init container ensure that runs for the same organism
do not overlap, regardless of which CronJob spawned them.
Expects a dict:
  key             - organism key
  dockerTag       - resolved docker tag
  organismContent - the organism's contents (must contain .ingest)
  Values          - root .Values (for resources, image pull policy, priority class)
  args            - list of args for the ingest container
*/}}
{{- define "loculus.ingestPodSpec" -}}
{{- $key := .key -}}
{{- $dockerTag := .dockerTag -}}
{{- $organismContent := .organismContent -}}
{{- $Values := .Values -}}
{{- $args := .args -}}
metadata:
  labels:
    app: loculus
    component: loculus-ingest-cronjob-{{ $key }}
    ingest-organism: {{ $key }}
    loculus-ingest-runner: "true"
spec:
  {{- include "possiblePriorityClassName" (dict "Values" $Values) | nindent 2 }}
  serviceAccountName: loculus-ingest-lock
  restartPolicy: Never
  initContainers:
    - name: version-check
      image: busybox
      {{- include "loculus.resources" (list "ingest-init" $Values) | nindent 6 }}
      command: ['sh', '-c', '
        CONFIG_VERSION=$(grep "verify_loculus_version_is:" /package/config/config.yaml | sed "s/verify_loculus_version_is: //;");
        DOCKER_TAG="{{ $dockerTag }}";
        echo "Config version: $CONFIG_VERSION";
        echo "Docker tag: $DOCKER_TAG";
        if [ "$CONFIG_VERSION" != "$DOCKER_TAG" ]; then
          echo "Version mismatch: ConfigMap version $CONFIG_VERSION does not match docker tag $DOCKER_TAG";
          exit 1;
        else
          echo "Version match confirmed";
        fi
      ']
      volumeMounts:
        - name: loculus-ingest-config-volume-{{ $key }}
          mountPath: /package/config/config.yaml
          subPath: config.yaml
    - name: wait-for-no-other-ingest
      image: alpine/kubectl:1.36.0
      command:
        - sh
        - -c
        - |
          set -eu
          while true; do
            ALL=$(kubectl get pods \
              -l ingest-organism={{ $key }},loculus-ingest-runner=true \
              -o jsonpath='{range .items[*]}{.metadata.name} {.status.phase}{"\n"}{end}')
            RUNNING=$(echo "$ALL" | awk -v me="$HOSTNAME" '$2=="Running" && $1!=me {print $1}')
            if [ -n "$RUNNING" ]; then
              echo "Waiting for running ingest pod(s) for {{ $key }}: $RUNNING"
              sleep 30
              continue
            fi
            # No peer in Running. Tie-break among Pending pods (typically all in init):
            # lowest pod name by lexicographic order wins, others wait until it transitions.
            LEADER=$(echo "$ALL" | awk '$2=="Pending" {print $1}' | sort | head -n 1)
            if [ -z "$LEADER" ] || [ "$LEADER" = "$HOSTNAME" ]; then
              echo "No conflicting ingest pods for {{ $key }}, proceeding."
              exit 0
            fi
            echo "Tie-break for {{ $key }}: yielding to lower-named peer $LEADER"
            sleep 10
          done
  containers:
    - name: ingest-{{ $key }}
      image: {{ $organismContent.ingest.image }}:{{ $dockerTag }}
      imagePullPolicy: {{ $Values.imagePullPolicy }}
      {{- include "loculus.resources" (list "ingest" $Values) | nindent 6 }}
      env:
        - name: KEYCLOAK_INGEST_PASSWORD
          valueFrom:
            secretKeyRef:
              name: service-accounts
              key: insdcIngestUserPassword
        - name: SLACK_HOOK
          valueFrom:
            secretKeyRef:
              name: slack-notifications
              key: slack-hook
        - name: NCBI_API_KEY
          valueFrom:
            secretKeyRef:
              name: ingest-ncbi
              key: api-key
      args:
        {{- range $args }}
        - {{ . | quote }}
        {{- end }}
      {{- if $organismContent.ingest.configFile }}
      volumeMounts:
        - name: loculus-ingest-config-volume-{{ $key }}
          mountPath: /package/config/config.yaml
          subPath: config.yaml
      {{- end }}
  {{- if $organismContent.ingest.configFile }}
  volumes:
    - name: loculus-ingest-config-volume-{{ $key }}
      configMap:
        name: loculus-ingest-config-{{ $key }}
  {{- end }}
{{- end -}}
