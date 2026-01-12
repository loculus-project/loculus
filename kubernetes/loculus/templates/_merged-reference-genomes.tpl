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
    {{- if $singleReference -}}
      {{/* Single reference mode - no suffix */}}
      {{- $lapisNucleotideSequences = append $lapisNucleotideSequences (dict
        "name" $segmentName
        "sequence" $reference.sequence
      ) -}}

      {{/* Add genes if present */}}
      {{- if $reference.genes -}}
        {{- range $gene := $reference.genes -}}
          {{- $lapisGenes = append $lapisGenes (dict
            "name" $gene.name
            "sequence" $gene.sequence
          ) -}}
        {{- end -}}
      {{- end -}}
    {{- else -}}
      {{- if $singleSegment -}}
        {{- $lapisNucleotideSequences = append $lapisNucleotideSequences (dict
          "name" $reference.reference_name
          "sequence" $reference.sequence
        ) -}}

        {{/* Add genes if present */}}
        {{- if $reference.genes -}}
          {{- $referenceSuffix := printf "_%s" $reference.reference_name -}}
          {{- range $gene := $reference.genes -}}
            {{- $lapisGenes = append $lapisGenes (dict
              "name" (printf "%s%s" $gene.name $referenceSuffix)
              "sequence" $gene.sequence
            ) -}}
          {{- end -}}
        {{- end -}}
      {{- else -}}
        {{/* Multiple references mode - add suffix to names */}}
        {{- $referenceSuffix := printf "_%s" $reference.reference_name -}}
        {{- $lapisNucleotideSequences = append $lapisNucleotideSequences (dict
          "name" (printf "%s%s" $segmentName $referenceSuffix)
          "sequence" $reference.sequence
        ) -}}

        {{/* Add genes if present */}}
        {{- if $reference.genes -}}
          {{- range $gene := $reference.genes -}}
            {{- $lapisGenes = append $lapisGenes (dict
              "name" (printf "%s%s" $gene.name $referenceSuffix)
              "sequence" $gene.sequence
            ) -}}
          {{- end -}}
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
