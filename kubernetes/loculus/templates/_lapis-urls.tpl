{{/* generates internal LAPIS urls from given config object */}}
{{ define "loculus.generateInternalLapisUrls" }}
  {{ range $key, $_ := (.Values.organisms | default .Values.defaultOrganisms) }}
    "{{ $key }}": "{{ if not $.Values.disableWebsite }}http://{{ template "loculus.lapisServiceName" $key }}:8080{{ else -}}http://localhost:8080/{{ $key }}{{ end }}"
  {{ end }}
{{ end }}

{{/* generates external LAPIS urls from { config, host } */}}
{{ define "loculus.generateExternalLapisUrls"}}
{{ $lapisUrlTemplate := .lapisUrlTemplate }}
{{ range $key, $_ := (.config.organisms | default .config.defaultOrganisms) }}
"{{ $key -}}": "{{ $lapisUrlTemplate | replace "%organism%" $key }}"
{{ end }}
{{ end }}

{{/* generates the LAPIS service name for a given organism key */}}
{{- define "loculus.lapisServiceName"}}
{{- printf "loculus-lapis-service-%s" . }}
{{- end }}
