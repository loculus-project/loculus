{{- define "loculus.backendUrl" -}}
{{- $publicRuntimeConfig := $.Values.networking.publicHosts | default dict }}
  {{- if $publicRuntimeConfig.backendUrl }}
    {{- $publicRuntimeConfig.backendUrl -}}
  {{- else if eq $.Values.environment "server" -}}
    {{- (printf "https://backend%s%s" $.Values.networking.subdomainSeparator $.Values.host) -}}
  {{- else -}}
    {{- printf "http://%s:8079" $.Values.localHost -}}
  {{- end -}}
{{- end -}}

{{- define "loculus.websiteUrl" -}}
{{- $publicRuntimeConfig := $.Values.networking.publicHosts | default dict }}
  {{- if $publicRuntimeConfig.websiteUrl }}
    {{- $publicRuntimeConfig.websiteUrl -}}
  {{- else if eq $.Values.environment "server" -}}
    {{- (printf "https://%s" $.Values.host) -}}
  {{- else -}}
    {{- printf "http://%s:3000" $.Values.localHost -}}
  {{- end -}}
{{- end -}}

{{- define "loculus.s3Url" -}}
  {{- if $.Values.runDevelopmentS3 }}
    {{- if eq $.Values.environment "server" -}}
        {{- (printf "https://s3%s%s" $.Values.networking.subdomainSeparator $.Values.host) -}}
    {{- else -}}
        {{- printf "http://%s:8084" $.Values.localHost -}}
    {{- end -}}
  {{- else -}}
    {{- $.Values.s3.bucket.endpoint }}
  {{- end -}}
{{- end -}}

{{- define "loculus.s3UrlInternal" -}}
  {{- if $.Values.runDevelopmentS3 }}
    {{- "http://loculus-minio-service:8084" -}}
  {{- else -}}
    {{- $.Values.s3.bucket.endpoint }}
  {{- end -}}
{{- end -}}

{{- define "loculus.keycloakUrl" -}}
{{- $publicRuntimeConfig := $.Values.networking.publicHosts | default dict }}
  {{- if $publicRuntimeConfig.keycloakUrl }}
    {{- $publicRuntimeConfig.keycloakUrl -}}
  {{- else if eq $.Values.environment "server" -}}
    {{- (printf "https://authentication%s%s" $.Values.networking.subdomainSeparator $.Values.host) -}}
  {{- else -}}
    {{- printf "http://%s:8083" $.Values.localHost -}}
  {{- end -}}
{{- end -}}

{{/* generates internal LAPIS urls from given config object */}}
{{ define "loculus.generateInternalLapisUrls" }}
  {{ range $_, $item := (include "loculus.enabledOrganisms" . | fromJson).organisms }}
{{- $key := $item.key }}
    "{{ $key }}": "{{ if not $.Values.disableWebsite }}http://{{ template "loculus.lapisServiceName" $key }}:8080{{ else -}}http://{{ $.Values.localHost }}:8080/{{ $key }}{{ end }}"
  {{ end }}
{{ end }}

{{/* generates external LAPIS urls from { config, host } */}}
{{ define "loculus.generateExternalLapisUrls"}}
{{ $lapisUrlTemplate := .lapisUrlTemplate }}
{{ range $key, $organism := (.config.organisms | default .config.defaultOrganisms) }}
{{- if ne $organism.enabled false }}
"{{ $key -}}": "{{ $lapisUrlTemplate | replace "%organism%" $key }}"
{{- end }}
{{ end }}
{{ end }}

{{/* generates the LAPIS service name for a given organism key */}}
{{- define "loculus.lapisServiceName"}}
{{- printf "loculus-lapis-service-%s" . }}
{{- end }}

{{/* Public URL template for LAPIS, with %organism% placeholder */}}
{{- define "loculus.lapisUrlTemplate" -}}
{{- $publicRuntimeConfig := $.Values.networking.publicHosts | default dict }}
  {{- if $publicRuntimeConfig.lapisUrlTemplate -}}
    {{- $publicRuntimeConfig.lapisUrlTemplate -}}
  {{- else if eq $.Values.environment "server" -}}
    {{- printf "https://lapis%s%s/%%organism%%" $.Values.networking.subdomainSeparator $.Values.host -}}
  {{- else -}}
    {{- printf "http://%s:8080/%%organism%%" $.Values.localHost -}}
  {{- end -}}
{{- end -}}

{{/* Hostname of a public URL, for use in Ingress rules */}}
{{- define "loculus.ingressHost" -}}
{{- . | trimPrefix "https://" | trimPrefix "http://" | splitList "/" | first | splitList ":" | first -}}
{{- end -}}
