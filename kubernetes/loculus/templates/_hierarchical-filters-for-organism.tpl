{{- define "loculus.hierarchicalFiltersForOrganism" -}}
{{- $organism := . -}}
{{- $schema := $organism.schema | include "loculus.patchMetadataSchema" | fromYaml }}
{{- $filters := dict }}
{{- range $entry := $schema.metadata }}
  {{- if hasKey $entry "hierarchicalFilter" }}
    {{- $_ := set $filters $entry.name $entry.hierarchicalFilter }}
  {{- end }}
{{- end }}
{{- $filters | toYaml -}}
{{- end }}
