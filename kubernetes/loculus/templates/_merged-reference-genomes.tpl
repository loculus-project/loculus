{{- define "loculus.mergeReferenceGenomes" -}}
{{- $segmentFirstConfig := . -}}
{{- $lapisNucleotideSequences := list -}}
{{- $lapisGenes := list -}}

{{/* Extract all unique reference names from the first segment */}}
{{- $referenceNames := list -}}
{{- if $segmentFirstConfig -}}
  {{- $firstSegment := first (values $segmentFirstConfig) -}}
  {{- $referenceNames = keys $firstSegment -}}
{{- end -}}

{{/* Check if this is single-reference mode (only one reference across all segments) */}}
{{- if eq (len $referenceNames) 1 -}}
  {{/* Single reference mode - no prefixing */}}
  {{- $singleRef := first $referenceNames -}}

  {{/* Process each segment */}}
  {{- range $segmentName, $refMap := $segmentFirstConfig -}}
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
  {{/* Multi-reference mode - prefix with reference name */}}

  {{/* Process each reference */}}
  {{- range $refName := $referenceNames -}}
    {{/* Process each segment */}}
    {{- range $segmentName, $refMap := $segmentFirstConfig -}}
      {{- $refData := index $refMap $refName -}}
      {{- if $refData -}}
        {{/* Add nucleotide sequence with reference prefix */}}
        {{- $lapisNucleotideSequences = append $lapisNucleotideSequences (dict
          "name" (printf "%s-%s" $refName $segmentName)
          "sequence" $refData.sequence
        ) -}}

        {{/* Add genes with reference prefix if present */}}
        {{- if $refData.genes -}}
          {{- range $geneName, $geneData := $refData.genes -}}
            {{- $lapisGenes = append $lapisGenes (dict
              "name" (printf "%s-%s" $refName $geneName)
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


{{- define "loculus.extractUniqueRawNucleotideSequenceNames" -}}
{{- $segmentFirstConfig := . -}}

{{/* Extract segment names directly from top-level keys */}}
{{- $segmentNames := keys $segmentFirstConfig -}}

segments:
{{- $segmentNames | sortAlpha | toYaml | nindent 2 -}}
{{- end -}}
