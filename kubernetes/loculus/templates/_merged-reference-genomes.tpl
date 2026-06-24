{{- define "loculus.getNucleotideSegmentNames" -}}
{{- $segmentWithReferencesList := . -}}

{{/* Extract segment names directly from .name */}}
{{- $segmentNames := list -}}
{{- $displayNameMap := dict -}}

{{- range $segment := $segmentWithReferencesList -}}
  {{- if $segment.displayName -}}
    {{- $_ := set $displayNameMap $segment.name $segment.displayName -}}
  {{- end -}}
  {{- $segmentNames = append $segmentNames $segment.name -}}
{{- end -}}

segments:
{{- $segmentNames | sortAlpha | toYaml | nindent 2 }}
displayNames:
{{- $displayNameMap | toYaml | nindent 2 }}
{{- end -}}
