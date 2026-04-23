{{- define "loculus.configProcessor" -}}
- name: config-processor-{{ .name }}
  image: ghcr.io/loculus-project/config-processor:{{ .dockerTag }}
  imagePullPolicy: {{ $.imagePullPolicy }}
  volumeMounts:
    - name: {{ .name }}
      mountPath: /input
    - name: {{ .name }}-processed
      mountPath: /output
  command: ["python3"]
  args: ["/app/config-processor.py", "/input", "/output"]
  resources:
    requests:
      cpu: 50m
      memory: 64Mi
    limits:
      cpu: 500m
      memory: 256Mi
  env:
    - name: LOCULUSSUB_smtpPassword
      valueFrom:
        secretKeyRef:
          name: smtp-password
          key: secretKey
    - name: LOCULUSSUB_insdcIngestUserPassword
      valueFrom:
        secretKeyRef:
          name: service-accounts
          key: insdcIngestUserPassword
    - name: LOCULUSSUB_preprocessingPipelinePassword
      valueFrom:
        secretKeyRef:
          name: service-accounts
          key: preprocessingPipelinePassword
    - name: LOCULUSSUB_externalMetadataUpdaterPassword
      valueFrom:
        secretKeyRef:
          name: service-accounts
          key: externalMetadataUpdaterPassword
    - name: LOCULUSSUB_backendUserPassword
      valueFrom:
        secretKeyRef:
          name: service-accounts
          key: backendUserPassword
    - name: LOCULUSSUB_backendKeycloakClientSecret
      valueFrom:
        secretKeyRef:
          name: backend-keycloak-client-secret
          key: backendKeycloakClientSecret
    - name: LOCULUSSUB_orcidSecret
      valueFrom:
        secretKeyRef:
          name: orcid
          key: orcidSecret
{{- end }}


{{- define "loculus.configVolume" -}}
- name: {{ .name }}
{{- if .configmaps }}
  projected:
    sources:
      {{- range .configmaps }}
      - configMap:
          name: {{ . }}
      {{- end }}
{{- else }}
  configMap:
    name: {{ if .configmap }}{{ .configmap }}{{ else }}{{ .name }}{{ end }}
{{- end }}
- name: {{ .name }}-processed
  emptyDir: {}
{{- end }}
