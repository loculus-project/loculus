{{- define "loculus.mergeReferenceGenomes" -}}
{{- $segmentFirstConfig := . -}}
{{- $lapisNucleotideSequences := list -}}
{{- $lapisGenes := list -}}

{{/* Handle empty reference genomes */}}
{{- if or (not $segmentFirstConfig) (eq (len $segmentFirstConfig) 0) -}}
{{- $result := dict "nucleotideSequences" (list) "genes" (list) -}}
{{- $result | toYaml -}}
{{- else -}}

{{- range $segmentName, $refMap := $segmentFirstConfig -}}
  {{- if eq (len $refMap) 1 -}}
    {{/* Single reference mode - no suffix */}}
    {{- $singleRef := first $refMap -}}

    {{- $refData := index $refMap $singleRef -}}
    {{- if $refData -}}
      {{/* Add nucleotide sequence */}}
      {{- $lapisNucleotideSequences = append $lapisNucleotideSequences (dict
        "name" $segmentName
        "sequence" $refData.sequence
      ) -}}

      {{/* Add genes if present */}}
      {{- if $refData.genes -}}
        {{- range $geneName, $geneData := $refData.genes -}}
          {{- $lapisGenes = append $lapisGenes (dict
            "name" $geneName
            "sequence" $geneData.sequence
          ) -}}
        {{- end -}}
      {{- end -}}
    {{- end -}}
  {{- end -}}

{{- else -}}
{{/* Multi-reference mode - suffix with reference name */}}
  {{- range $refName, $refData := $refMap -}}
    {{- if $refData -}}
      {{- if eq len($segmentFirstConfig) 1-}}
        {{/* Add nucleotide sequence without segmentName */}}
        {{- $lapisNucleotideSequences = append $lapisNucleotideSequences (dict
          "name" $refName
          "sequence" $refData.sequence
        ) -}}
      {{- else -}}
        {{/* Add nucleotide sequence with reference suffix */}}
        {{- $lapisNucleotideSequences = append $lapisNucleotideSequences (dict
          "name" (printf "%s-%s" $segmentName $refName)
          "sequence" $refData.sequence
        ) -}}
      {{- end -}}

      {{/* Add genes with reference prefix if present */}}
      {{- if $refData.genes -}}
        {{- range $geneName, $geneData := $refData.genes -}}
          {{- $lapisGenes = append $lapisGenes (dict
            "name" (printf "%s-%s" $geneName $refName)
            "sequence" $geneData.sequence
          ) -}}
        {{- end -}}
      {{- end -}}
    {{- end -}}
  {{- end -}}
{{- end -}}

{{- end -}}

{{- $result := dict "nucleotideSequences" $lapisNucleotideSequences "genes" $lapisGenes -}}
{{- $result | toYaml -}}
{{- end -}}
{{- end -}}


{{- define "loculus.extractUniqueRawNucleotideSequenceNames" -}}
{{- $segmentFirstConfig := . -}}

{{/* Extract segment names directly from top-level keys */}}
{{- $segmentNames := keys $segmentFirstConfig -}}

segments:
{{- $segmentNames | sortAlpha | toYaml | nindent 2 -}}
{{- end -}}
