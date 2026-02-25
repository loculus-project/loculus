{{- define "loculus.lineageSystemsForOrganism" -}}
{{- $organism := . -}}
{{- $schema := $organism.schema | include "loculus.patchMetadataSchema" | fromYaml }}
{{- $lineageSystems := list }}
{{- range $entry := $schema.metadata }}
  {{- if hasKey $entry "lineageSystem" }}
    {{- if not (has $entry.lineageSystem $lineageSystems) }}
      {{- $lineageSystems = append $lineageSystems $entry.lineageSystem }}
    {{- end }}
  {{- end }}
{{- end }}
{{- $lineageSystems | toJson -}}
{{- end }}
