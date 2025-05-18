{{- define "loculus.lineageSystemForOrganism" -}}
{{- $organism := . -}}
{{- $schema := $organism.schema | include "loculus.patchMetadataSchema" | fromYaml }}
{{- $lineageSystems := list }}
{{- range $entry := $schema.metadata }}
  {{- if hasKey $entry "lineageSystem" }}
    {{- $lineageSystems = append $lineageSystems $entry.lineageSystem }}
  {{- end }}
{{- end }}

{{- $uniqueLineageSystems := $lineageSystems | uniq }}
{{- if gt (len $uniqueLineageSystems) 1 }}
  {{- fail (printf "Multiple lineage systems found: %v" $uniqueLineageSystems) }}
{{- else if eq (len $uniqueLineageSystems) 0 }}
  {{- /*no op*/ -}}
{{- else }}
  {{- index $uniqueLineageSystems 0 -}}
{{- end }}
{{- end }}
