{{- define "loculus.backendUrl" -}}
{{- $publicRuntimeConfig := $.Values.public }}
  {{- if $publicRuntimeConfig.backendUrl }}
    {{- $publicRuntimeConfig.backendUrl -}}
  {{- else if eq $.Values.environment "server" -}}
    {{- (printf "https://backend%s%s" $.Values.subdomainSeparator $.Values.host) -}}
  {{- else -}}
    {{- printf "http://%s:8079" $.Values.localHost -}}
  {{- end -}}
{{- end -}}

{{- define "loculus.websiteUrl" -}}
{{- $publicRuntimeConfig := $.Values.public }}
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
        {{- (printf "https://s3%s%s" $.Values.subdomainSeparator $.Values.host) -}}
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
{{- $publicRuntimeConfig := $.Values.public }}
  {{- if $publicRuntimeConfig.keycloakUrl }}
    {{- $publicRuntimeConfig.keycloakUrl -}}
  {{- else if eq $.Values.environment "server" -}}
    {{- (printf "https://authentication%s%s" $.Values.subdomainSeparator $.Values.host) -}}
  {{- else -}}
    {{- printf "http://%s:8083" $.Values.localHost -}}
  {{- end -}}
{{- end -}}

{{/* generates internal LAPIS urls from given config object */}}
{{ define "loculus.generateInternalLapisUrls" }}
  {{ range $_, $item := (include "loculus.enabledOrganisms" . | fromJson).organisms }}
{{- $key := $item.key }}
    {{- if $.Values.useSequlus }}
    "{{ $key }}": "http://loculus-sequlus-service:8090/{{ $key }}"
    {{- else }}
    "{{ $key }}": "{{ if not $.Values.disableWebsite }}http://{{ template "loculus.lapisServiceName" $key }}:8080{{ else -}}http://{{ $.Values.localHost }}:8080/{{ $key }}{{ end }}"
    {{- end }}
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
