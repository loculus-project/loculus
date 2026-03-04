{{- define "loculus.inputFields" -}}
{{- $data := . }}
{{- $metadata := $data.metadata }}
{{- $extraFields := $data.extraInputFields }}
{{- $TO_KEEP := list "name" "displayName" "definition" "guidance" "example" "required" "noEdit" "desired" "options"}}

{{- /* Determine default id field based on maxSequencesPerEntry */}}
{{- $maxSeq := 1 }}
{{- if and (hasKey $data "submissionDataTypes") (hasKey $data.submissionDataTypes "maxSequencesPerEntry") }}
  {{- $maxSeq = $data.submissionDataTypes.maxSequencesPerEntry }}
{{- end }}
{{- $hasIdField := false }}
{{- range ($extraFields | default list) }}
  {{- if eq .name "id" }}
    {{- $hasIdField = true }}
  {{- end }}
{{- end }}

{{- $fieldsDict := dict }}
{{- $index := 0 }}

{{- /* Add default id field first if not overridden */}}
{{- if not $hasIdField }}
  {{- $defaultIdField := dict "name" "id" "displayName" "ID" "example" "GJP123" }}
  {{- if eq (int $maxSeq) 1 }}
    {{- $_ := set $defaultIdField "definition" "Your sequence identifier; should match the sequence's id in the FASTA file - this is used to link the metadata to the FASTA sequence." }}
  {{- else }}
    {{- $_ := set $defaultIdField "definition" "METADATA ID" }}
    {{- $_ := set $defaultIdField "guidance" "Your sample identifier. (If no `fastaIds` column is provided, this sample ID will be used to associate the metadata with the sequence.)" }}
  {{- end }}
  {{- $_ := set $fieldsDict (printf "%03d" $index) $defaultIdField }}
  {{- $index = add $index 1 }}
{{- end }}

{{- /* Add default fastaIds field for multi-segment organisms if not overridden */}}
{{- if ne (int $maxSeq) 1 }}
  {{- $hasFastaIdsField := false }}
  {{- range ($extraFields | default list) }}
    {{- if eq .name "fastaIds" }}
      {{- $hasFastaIdsField = true }}
    {{- end }}
  {{- end }}
  {{- if not $hasFastaIdsField }}
    {{- $defaultFastaIdsField := dict "name" "fastaIds" "displayName" "FASTA IDS" "definition" "FASTA IDS" "guidance" "Space-separated list of FASTA IDS of each sequence to be associated with this metadata entry." "example" "GJP123 GJP124" "desired" true }}
    {{- $_ := set $fieldsDict (printf "%03d" $index) $defaultFastaIdsField }}
    {{- $index = add $index 1 }}
  {{- end }}
{{- end }}

{{- /* Add fields with position "first" to the dict */}}
{{- range $field := $extraFields }}
  {{- if eq $field.position "first" }}
    {{- $_ := set $fieldsDict (printf "%03d" $index) $field }}
    {{- $index = add $index 1 }}
  {{- end }}
{{- end }}

{{- /* Add filtered metadata fields to the dict */}}
{{- range $field := $metadata }}
  {{- if not (hasKey $field "noInput") }}
    {{- $_ := set $fieldsDict (printf "%03d" $index) $field }}
    {{- $index = add $index 1 }}
  {{- end }}
{{- end }}

{{- /* Add fields with position "last" to the dict */}}
{{- range $field := $extraFields }}
  {{- if eq $field.position "last" }}
    {{- $_ := set $fieldsDict (printf "%03d" $index) $field }}
    {{- $index = add $index 1 }}
  {{- end }}
{{- end }}

{{- /* Iterate over sorted index to get list of values (sorted by key) */}}
{{- $inputFields := list }}
{{- range $k:= keys $fieldsDict | sortAlpha }}
  {{- $toAdd := dict }}
  {{- range $k, $v := (index $fieldsDict $k) }}
    {{- if has $k $TO_KEEP }}
      {{- $_ := set $toAdd $k $v }}
    {{- end }}
  {{- end }}
  {{- $inputFields = append $inputFields $toAdd }}
{{- end }}

{{- toYaml $inputFields }}
{{- end -}}