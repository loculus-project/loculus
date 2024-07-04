{{- define "loculus.configProcessor" -}}
- name: config-processor-{{ .name }}
  image: ghcr.io/loculus-project/config-processor:{{ .dockerTag }}
  imagePullPolicy: Always
  volumeMounts:
    - name: {{ .name }}
      mountPath: /input
    - name: {{ .name }}-processed
      mountPath: /output
  command: ["python3"]
  args: ["/app/config-processor.py", "/input", "/output"]
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
    - name: LOCULUSSUB_dummyPreprocessingPipelinePassword
      valueFrom:
        secretKeyRef:
          name: service-accounts
          key: dummyPreprocessingPipelinePassword
    - name: LOCULUSSUB_dummyExternalMetadataUpdaterPassword
      valueFrom:
        secretKeyRef:
          name: service-accounts
          key: dummyExternalMetadataUpdaterPassword
    - name: LOCULUSSUB_siloImportJobPassword
      valueFrom:
        secretKeyRef:
          name: service-accounts
          key: siloImportJobPassword
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
  configMap:
    name: {{ if .configmap }}{{ .configmap }}{{ else }}{{ .name }}{{ end }}
- name: {{ .name }}-processed
  emptyDir: {}
{{- end }}
