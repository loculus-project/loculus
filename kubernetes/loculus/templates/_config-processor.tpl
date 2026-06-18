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
    - name: LOCULUSSUB_lldapAdminPassword
      valueFrom:
        secretKeyRef:
          name: lldap-secrets
          key: adminPassword
    - name: LOCULUSSUB_autheliaSessionSecret
      valueFrom:
        secretKeyRef:
          name: authelia-secrets
          key: sessionSecret
    - name: LOCULUSSUB_autheliaStorageEncryptionKey
      valueFrom:
        secretKeyRef:
          name: authelia-secrets
          key: storageEncryptionKey
    - name: LOCULUSSUB_autheliaJwtSecret
      valueFrom:
        secretKeyRef:
          name: authelia-secrets
          key: jwtSecret
    - name: LOCULUSSUB_autheliaOidcHmacSecret
      valueFrom:
        secretKeyRef:
          name: authelia-secrets
          key: oidcHmacSecret
    - name: LOCULUSSUB_backendClientSecret
      valueFrom:
        secretKeyRef:
          name: authelia-secrets
          key: backendClientSecretHash
    - name: LOCULUSSUB_backendClientSecretPlain
      valueFrom:
        secretKeyRef:
          name: authelia-secrets
          key: backendClientSecretPlain
{{- end }}


{{- define "loculus.configVolume" -}}
- name: {{ .name }}
  configMap:
    name: {{ if .configmap }}{{ .configmap }}{{ else }}{{ .name }}{{ end }}
- name: {{ .name }}-processed
  emptyDir: {}
{{- end }}
