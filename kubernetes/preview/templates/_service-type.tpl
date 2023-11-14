{{/* on cd we expose the services via ingress */}}
{{- define "pathoplexus.serviceType"}}
  {{- if eq .Values.mode "cd" }}
  type: ClusterIP
  {{- else }}
  type: NodePort
  {{- end }}
{{- end }}
