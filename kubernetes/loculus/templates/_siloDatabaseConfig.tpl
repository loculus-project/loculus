{{/*
  Unified SILO database config for a single LAPIS/SILO instance covering all organisms.
  Merges metadata from all organisms; deduplication by name (first occurrence wins,
  caller must ensure no type conflicts for same-named fields across organisms).
  Adds an "organism" field as the first metadata entry.
  Sequence names are organism-prefixed (handled by get-released-data / reference genomes).
*/}}
{{- define "loculus.unifiedSiloDatabaseConfig" }}
{{- $commonMetadata := .commonMetadata }}
{{- $sharedMetadata := .sharedMetadata }}
{{- $organisms := .organisms }}
schema:
  instanceName: unified
  opennessLevel: OPEN
  metadata:
    - type: string
      generateIndex: true
      name: organism
  {{- range $commonMetadata }}
    {{- include "loculus.siloDatabaseShared" . | nindent 4 }}
      name: {{ .name }}
  {{- end }}
  {{- range $sharedMetadata }}
    {{- include "loculus.siloDatabaseShared" . | nindent 4 }}
      name: {{ .name }}
  {{- end }}
  {{- $seenFields := dict }}
  {{- range $_, $item := $organisms }}
  {{- range ($item.contents.schema.organismSpecificMetadata | default list) }}
  {{- if not (hasKey $seenFields .name) }}
  {{- $_ := set $seenFields .name true }}
    {{- include "loculus.siloDatabaseShared" . | nindent 4 }}
      name: {{ .name }}
  {{- end }}
  {{- end }}
  {{- end }}
  primaryKey: accessionVersion
  features:
    - name: generalizedAdvancedQuery
{{- end }}

{{/*
  Merges reference genomes from all organisms with organism-prefixed sequence names.
  Single-segment organisms: nucleotide sequence named {organism}.
  Multi-segment organisms: nucleotide sequences named {organism}_{segment}.
  Genes: named {organism}_{gene}.
*/}}
{{- define "loculus.mergeAllOrganismReferenceGenomes" }}
{{- $allNucleotide := list }}
{{- $allGenes := list }}
{{- range $_, $item := .organisms }}
{{- $key := $item.key }}
{{- $refGenomes := $item.contents.referenceGenomes }}
{{- $merged := include "loculus.mergeReferenceGenomes" $refGenomes | fromYaml }}
{{- $isSingle := eq (len $merged.nucleotideSequences) 1 }}
{{- range $merged.nucleotideSequences }}
  {{- $name := ternary $key (printf "%s_%s" $key .name) $isSingle }}
  {{- $allNucleotide = append $allNucleotide (dict "name" $name "sequence" .sequence) }}
{{- end }}
{{- range $merged.genes }}
  {{- $allGenes = append $allGenes (dict "name" (printf "%s_%s" $key .name) "sequence" .sequence) }}
{{- end }}
{{- end }}
nucleotideSequences:
{{ $allNucleotide | toYaml | nindent 2 }}
genes:
{{ $allGenes | toYaml | nindent 2 }}
{{- end }}

{{- define "loculus.siloDatabaseShared" -}}
{{- $type := default "string" .type -}}
{{- $lineageName := ternary .name (default "" .lineageSystem) (not (empty .hierarchicalFilter)) -}}
- type: {{ ($type | eq "timestamp") | ternary "int" (($type | eq "authors") | ternary "string" $type) }}
  {{- if and .generateIndex (not $lineageName) }}
  generateIndex: {{ .generateIndex }}
  {{- end }}
  {{- if $lineageName }}
  generateIndex: true
  generateLineageIndex: {{ $lineageName }} {{- /* must match the file name in the lineageDefinitionFilenames */}}
  {{- end }}
{{- end }}


{{- define "loculus.siloDatabaseConfig" }}
{{- $schema := .schema }}
{{- $rawUniqueSegments := (include "loculus.getNucleotideSegmentNames" .referenceGenomes | fromYaml).segments }}
{{- $isSegmented := gt (len $rawUniqueSegments) 1 }}
schema:
  instanceName: {{ $schema.organismName }}
  opennessLevel: OPEN
  metadata:
  {{- range (concat .commonMetadata $schema.metadata) }}
  {{- $currentItem := . }}
  {{- if and $isSegmented .perSegment }}
    {{- range $segment := $rawUniqueSegments }}
    {{- with $currentItem }}
    {{- include "loculus.siloDatabaseShared" . | nindent 4 }}
      name: {{ printf "%s_%s" .name $segment | quote}}
    {{- end }}
    {{- end }}
  {{- else }}
    {{- include "loculus.siloDatabaseShared" . | nindent 4 }}
      name: {{ .name }}
  {{- end }}
  {{- end }}
  {{- if $schema.files }}
  {{- range $schema.files }}
    - type: string
      name: {{ .name }}
  {{- end }}
  {{- end }}
  primaryKey: accessionVersion
  features:
    - name: generalizedAdvancedQuery
{{- end }}
