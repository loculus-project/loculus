{{- /*
  Adapter init-container spec for SILO + LAPIS pods.

  Inputs (passed via `include` with a dict):
    organismKey       — string, the organism key (e.g. "ebola-sudan")
    configVersion     — int, the pinned organism config version (default: 1)
    instanceVersion   — int (optional), pinned instance config version
    dockerTag         — string, resolved Loculus docker tag
    imagePullPolicy   — string
    backendUrl        — string, in-cluster Loculus backend URL

  The init container writes
    /loculus-config/{database_config.yaml,reference_genomes.json,preprocessing_config.yaml}
  to the shared emptyDir mounted as `lapis-silo-database-config-processed`,
  matching the path that SILO + LAPIS already mount today.
*/}}
{{- define "loculus.configAdapterInitContainer" -}}
- name: config-adapter-{{ .organismKey }}
  image: "{{ .images.configAdapter.repository }}:{{ .images.configAdapter.tag | default .dockerTag }}"
  imagePullPolicy: {{ .images.configAdapter.pullPolicy | default .imagePullPolicy }}
  env:
    - name: LOCULUS_BACKEND_URL
      value: {{ .backendUrl | quote }}
    - name: LOCULUS_ORGANISM_KEY
      value: {{ .organismKey | quote }}
    - name: LOCULUS_ORGANISM_CONFIG_VERSION
      value: {{ default 1 .configVersion | quote }}
    {{- if .instanceVersion }}
    - name: LOCULUS_INSTANCE_CONFIG_VERSION
      value: {{ .instanceVersion | quote }}
    {{- end }}
    - name: LOCULUS_CONFIG_OUTPUT_DIR
      value: "/loculus-config"
  volumeMounts:
    - name: lapis-silo-database-config-processed
      mountPath: /loculus-config
  resources:
    requests:
      cpu: 50m
      memory: 64Mi
    limits:
      cpu: 500m
      memory: 256Mi
{{- end }}

{{- /*
  Adapter init-container spec for the cross-organism overview SILO + LAPIS pods.

  Inputs (passed via `include` with a dict):
    viewKey          — string, the SQL-backed view key
    dockerTag         — string, resolved Loculus docker tag
    imagePullPolicy   — string
    images            — .Values.images
    backendUrl        — string, in-cluster Loculus backend URL

  Runs the adapter in overview mode: it fetches only the instance config and
  writes /loculus-config/{database_config.yaml,reference_genomes.json,
  preprocessing_config.yaml,overview_query.sql}.
*/}}
{{- define "loculus.overviewConfigAdapterInitContainer" -}}
- name: config-adapter-{{ .viewKey }}
  image: "{{ .images.configAdapter.repository }}:{{ .images.configAdapter.tag | default .dockerTag }}"
  imagePullPolicy: {{ .images.configAdapter.pullPolicy | default .imagePullPolicy }}
  env:
    - name: LOCULUS_CONFIG_MODE
      value: "overview"
    - name: LOCULUS_BACKEND_URL
      value: {{ .backendUrl | quote }}
    - name: LOCULUS_VIEW_KEY
      value: {{ .viewKey | quote }}
    - name: LOCULUS_CONFIG_OUTPUT_DIR
      value: "/loculus-config"
  volumeMounts:
    - name: lapis-silo-database-config-processed
      mountPath: /loculus-config
  resources:
    requests:
      cpu: 50m
      memory: 64Mi
    limits:
      cpu: 500m
      memory: 256Mi
{{- end }}

{{- /*
  Replacement for `loculus.configVolume`: only the processed emptyDir, no
  ConfigMap source. The adapter init container writes its outputs straight to
  the emptyDir.
*/}}
{{- define "loculus.adapterVolume" -}}
- name: lapis-silo-database-config-processed
  emptyDir: {}
{{- end }}
