{{- define "loculus.hierarchicalFiltersForOrganism" -}}
{{- $organism := . -}}
{{- $schema := $organism.schema | include "loculus.patchMetadataSchema" | fromYaml }}
{{- $filters := list }}
{{- range $entry := $schema.metadata }}
  {{- if hasKey $entry "hierarchicalFilter" }}
    {{- $filters = append $filters (dict "name" $entry.hierarchicalFilter "metadataField" $entry.name) }}
  {{- end }}
{{- end }}
{{- $filters | toYaml -}}
{{- end }}
