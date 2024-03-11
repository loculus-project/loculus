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
{{- end }}


{{- define "loculus.configVolume" -}}
- name: {{ .name }}
  configMap:
    name: {{ if .configmap }}{{ .configmap }}{{ else }}{{ .name }}{{ end }}
- name: {{ .name }}-processed
  emptyDir: {}
{{- end }}
