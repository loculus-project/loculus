{{/* Reference to servers-transport.yaml, for the Service annotation:
https://doc.traefik.io/traefik/reference/routing-configuration/kubernetes/ingress/#on-service */}}
{{- define "loculus.serversTransportRef" -}}
{{- printf "%s-short-idle-conn-timeout@kubernetescrd" .Release.Namespace -}}
{{- end -}}
