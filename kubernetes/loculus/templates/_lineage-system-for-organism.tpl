{{/*
This template looks up the lineage system for a specific organism and generates
its JSON configuration based on the defined lineage systems in `lineageSystemDefinitions`.

Parameters:
  - $organismName: The name of the organism (e.g., "west-nile").
  
Returns:
  - The JSON representation of the lineage system defined in `lineageSystemDefinitions`
  - Returns nothing (empty string) if no lineage system is found or if multiple lineage systems are present.


Usage Example:
  {{- .Values.organisms[west-nile] | include "loculus.lineageSystemForOrganism" -}}
*/}}
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
  {{- $lineageSystem := index $uniqueLineageSystems 0 }}
  {{ fail .Values.name }}
  {{- $lineageData := index .Values.lineageSystemDefinitions $lineageSystem }}
  {{- toJson $lineageData }}
{{- end }}
{{- end }}
