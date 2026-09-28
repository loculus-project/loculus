{{/*
The query engine's view of an organism, from the same values as SILO's database config (_siloDatabaseConfig.tpl):
the same fields in the same order, but with Loculus types and with lineageSystem and hierarchicalFilter kept apart
instead of both becoming a lineage index. Expects a dict with schema (patched), commonMetadata, referenceGenomes and
lineageSystemDefinitions.
*/}}
{{- define "loculus.queryEngineSchema" }}
{{- $rawUniqueSegments := (include "loculus.getNucleotideSegmentNames" .referenceGenomes | fromYaml).segments }}
{{- $isSegmented := gt (len $rawUniqueSegments) 1 }}
{{- $lineageSystems := list }}
metadata:
{{- range $field := (concat .commonMetadata .schema.metadata) }}
  {{- $names := list $field.name }}
  {{- if and $isSegmented $field.perSegment }}
    {{- $names = list }}
    {{- range $segment := $rawUniqueSegments }}
      {{- $names = append $names (printf "%s_%s" $field.name $segment) }}
    {{- end }}
  {{- end }}
  {{- range $name := $names }}
  - name: {{ quote $name }}
    type: {{ default "string" $field.type | quote }}
    {{- if or $field.generateIndex $field.lineageSystem $field.hierarchicalFilter }}
    generateIndex: true
    {{- end }}
    {{- if $field.hierarchicalFilter }}
    hierarchicalFilter: {{ quote $field.hierarchicalFilter }}
    {{- else if $field.lineageSystem }}
    lineageSystem: {{ quote $field.lineageSystem }}
    {{- $lineageSystems = append $lineageSystems $field.lineageSystem }}
    {{- end }}
  {{- end }}
{{- end }}
{{- range .schema.files }}
  - name: {{ quote .name }}
    type: "string"
{{- end }}
{{- if $lineageSystems }}
lineageSystems:
{{- end }}
{{- range $system := uniq $lineageSystems }}
  {{- $definitions := index $.lineageSystemDefinitions $system }}
  {{- if not $definitions }}
    {{- fail (printf "lineageSystemDefinitions missing entry for lineage system '%s'" $system) }}
  {{- end }}
  {{ quote $system }}:
  {{- range $version, $url := $definitions }}
    {{ quote $version }}: {{ quote $url }}
  {{- end }}
{{- end }}
{{- end }}
