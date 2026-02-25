{{- define "loculus.lineageSystemForOrganism" -}}
{{- $organism := . -}}
{{- $schema := $organism.schema | include "loculus.patchMetadataSchema" | fromYaml }}
{{- $lineageSystems := list }}
{{- range $entry := $schema.metadata }}
  {{- if hasKey $entry "lineageSystem" }}
    {{- $lineageSystems = append $lineageSystems $entry.lineageSystem }}
  {{- end }}
{{- end }}
{{- end }}
