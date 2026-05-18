{{- define "loculus.sharedPreproSpecs" }}
{{ .key }}:  {{/* 'key' is either just 'name' of a metadata field, or 'name_segmentName' for segmented fields.*/}}
  {{- if .preprocessing }}
  {{- if hasKey .preprocessing "function" }}
  function: {{ index .preprocessing "function" }}
  {{- else }}
  function: identity
  {{- end }}
  {{- if hasKey .preprocessing "inputs" }}
  inputs:
    {{- $segment := .segment }}
    {{- $perSegmentFields := .perSegmentFields | default dict }}
    {{- range $argName, $inputField := (index .preprocessing "inputs") }}
    {{- /* When generating a per-segment spec, inputs that reference a per-segment
           metadata field must be suffixed with the segment, because the submitted
           metadata for those fields is itself segment-specific (e.g. ncbiReleaseDate_L). */}}
    {{- if and $segment (hasKey $perSegmentFields $inputField) }}
    {{ $argName }}: {{ printf "%s_%s" $inputField $segment }}
    {{- else }}
    {{ $argName }}: {{ $inputField }}
    {{- end }}
    {{- end }}
  {{- end }}
  args:
    {{- if .segment }}
    segment: {{ .segment }}
    {{- end }}
    {{- if .onlyForReference }}
    reference: {{ .onlyForReference }}
    {{- end }}
    {{- if .type }}
    type: {{ .type }}
    {{- end }}
    {{- if .options }}
    {{- $names := list }}
    {{- range .options }}
      {{- $names = append $names .name }}
    {{- end }}
    options: {{ toYaml $names | nindent 4 }}
    {{- end }}
    {{- with (get .preprocessing "args") }}
    {{ toYaml . | nindent 4 }}
    {{- end }}
  {{- else }}
  function: identity
  inputs:
    {{- if .segment }}
    input: {{ printf "%s_%s" .name .segment }}
    {{- else }}
    input: {{ .name }}
    {{- end }}
  args:
    {{- if .segment }}
    segment: {{ .segment }}
    {{- end }}
    {{- if .onlyForReference }}
    reference: {{ .onlyForReference }}
    {{- end }}
    {{- if .type }}
    type: {{ .type }}
    {{- end }}
  {{- end }}
  {{- if .required}}
  required: true
  {{- end }}
{{- end }}

{{/* Expects an object { metadata: [...], referenceGenomes: {...} }
  .metadata is an array of metadata fields. Each has name, type, displayName, header, required etc.
  .referenceGenomes is a map of reference genome definitions directly taken from the instance config of an organism.
*/}}
{{- define "loculus.preprocessingSpecs" -}}
{{- $metadata := .metadata }}
{{- $referenceGenomes := .referenceGenomes}}

{{- $rawUniqueSegments := (include "loculus.getNucleotideSegmentNames" $referenceGenomes | fromYaml).segments }}
{{- $isSegmented := gt (len $rawUniqueSegments) 1 }}

{{- /* Names of fields that are split per segment. Inputs referencing these must be
       segment-suffixed when generating per-segment specs. */}}
{{- $perSegmentFields := dict }}
{{- if $isSegmented }}
{{- range $metadata }}
{{- if .perSegment }}{{- $_ := set $perSegmentFields .name true }}{{- end }}
{{- end }}
{{- end }}

{{- range $metadata }}
    {{- $currentItem := . }}
    {{- if and $isSegmented .perSegment }}
        {{- range $segment := $rawUniqueSegments }}
            {{- with $currentItem }}
            {{- $args := deepCopy . | merge (dict "segment" $segment "key" (printf "%s_%s" .name $segment) "perSegmentFields" $perSegmentFields) }}
            {{- include "loculus.sharedPreproSpecs" $args }}
            {{- end }}
        {{- end }}
    {{- else }}
        {{- $segment := "" }}
        {{- if .relatesToSegment }}
        {{- $segment = .relatesToSegment }}
        {{- end }}
        {{- $args := deepCopy . | merge (dict "segment" $segment "key" .name "perSegmentFields" $perSegmentFields) }}
        {{- include "loculus.sharedPreproSpecs" $args }}
    {{- end }}
{{- end }}
{{- end }}