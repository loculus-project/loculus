{{/* on cd we expose the services via ingress */}}
{{- define "loculus.serviceType"}}
  test: $.Values.environment
  {{- if eq $.Values.environment "server" }}
  type: ClusterIP
  {{- else }}
  type: NodePort
  {{- end }}
{{- end }}
