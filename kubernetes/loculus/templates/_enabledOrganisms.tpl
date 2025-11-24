{{- define "loculus.enabledOrganisms" -}}
{{- $enabled := dict -}}
{{- range $key, $organism := (.Values.organisms | default .Values.defaultOrganisms) -}}
{{- if ne $organism.enabled false -}}
{{- $_ := set $enabled $key $organism -}}
{{- end -}}
{{- end -}}
{{- $enabled | toJson -}}
{{- end -}}

{{/*
Returns a sorted list of enabled organism keys for deterministic iteration.
Usage: {{ include "loculus.sortedOrganismKeys" . }}
*/}}
{{- define "loculus.sortedOrganismKeys" -}}
{{- keys (include "loculus.enabledOrganisms" . | fromJson) | sortAlpha | toJson -}}
{{- end -}}
