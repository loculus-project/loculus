{{- define "loculus.mergeReferenceGenomes" -}}
{{- $segmentWithReferencesList := . -}}
{{- $lapisNucleotideSequences := list -}}
{{- $lapisGenes := list -}}

{{- if or (not $segmentWithReferencesList) (eq (len $segmentWithReferencesList) 0) -}}
{{- $result := dict "nucleotideSequences" (list) "genes" (list) -}}
{{- $result | toYaml -}}
{{- else -}}

{{- $singleSegment := eq (len $segmentWithReferencesList) 1 -}}

{{- range $segment := $segmentWithReferencesList -}}
  {{- $segmentName := $segment.name -}}
  {{- $singleReference := eq (len $segment.references) 1 -}}
  {{- range $reference := $segment.references -}}
    {{- $referenceName := $reference.referenceName -}}
    {{- if $singleReference -}}
      {{/* Single reference mode - no suffix */}}
      {{- $lapisNucleotideSequences = append $lapisNucleotideSequences (dict
        "name" $segmentName
        "sequence" $reference.sequence
      ) -}}
    {{- else -}}
      {{- $name := printf "%s%s" (ternary "" (printf "%s-" $segmentName) $singleSegment) $referenceName -}}
      {{- $lapisNucleotideSequences = append $lapisNucleotideSequences (dict
        "name" $name
        "sequence" $reference.sequence
      ) -}}
    {{- end -}}

    {{/* Add genes if present */}}
    {{- if $reference.genes -}}
      {{- range $gene := $reference.genes -}}
        {{- if $singleReference -}}
          {{- $lapisGenes = append $lapisGenes (dict
            "name" $gene.name
            "sequence" $gene.sequence
          ) -}}
        {{- else -}}
          {{- $geneName := printf "%s-%s" $gene.name $referenceName -}}
          {{- $lapisGenes = append $lapisGenes (dict
            "name" $geneName
            "sequence" $gene.sequence
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


{{- define "loculus.getNucleotideSegmentNames" -}}
{{- $segmentWithReferencesList := . -}}

{{/* Extract segment names directly from .name */}}
{{- $segmentNames := list -}}
{{- range $segment := $segmentWithReferencesList -}}
  {{- $segmentNames = append $segmentNames $segment.name -}}
{{- end -}}

segments:
{{- $segmentNames | sortAlpha | toYaml | nindent 2 -}}
{{- end -}}
