{{/* Reference to servers-transport.yaml, as traefik expects it in a
`traefik.ingress.kubernetes.io/service.serverstransport` annotation. */}}
{{- define "loculus.serversTransportRef" -}}
{{- printf "%s-short-idle-conn-timeout@kubernetescrd" .Release.Namespace -}}
{{- end -}}
