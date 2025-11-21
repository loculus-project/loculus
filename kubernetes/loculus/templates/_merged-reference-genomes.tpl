{{- define "loculus.mergeReferenceGenomes" -}}
{{- $referenceGenomes := . -}}
{{- $lapisNucleotideSequences := list -}}
{{- $lapisGenes := list -}}

{{- if len $referenceGenomes | eq 1 }}
  {{- include "loculus.generateReferenceGenome" (first (values $referenceGenomes)) -}}
{{- else }}
  {{- range $suborganismName, $referenceGenomeRaw := $referenceGenomes -}}
    {{- $referenceGenome := include "loculus.generateReferenceGenome" $referenceGenomeRaw | fromYaml -}}

    {{- $nucleotideSequences := $referenceGenome.nucleotideSequences -}}
    {{- if $nucleotideSequences -}}
      {{- if eq (len $nucleotideSequences) 1 -}}
        {{- $lapisNucleotideSequences = append $lapisNucleotideSequences (dict
          "name" $suborganismName
          "sequence" (first $nucleotideSequences).sequence)
        -}}
      {{- else -}}
        {{- range $sequence := $nucleotideSequences -}}
          {{- $lapisNucleotideSequences = append $lapisNucleotideSequences (dict
            "name" (printf "%s-%s" $suborganismName $sequence.name)
            "sequence" $sequence.sequence
          ) -}}
        {{- end -}}
      {{- end -}}
    {{- end -}}

    {{- if $referenceGenome.genes -}}
      {{- range $gene := $referenceGenome.genes -}}
        {{- $lapisGenes = append $lapisGenes (dict
          "name" (printf "%s-%s" $suborganismName $gene.name)
          "sequence" $gene.sequence)
        -}}
      {{- end -}}
    {{- end -}}
  {{- end -}}

  {{- $result := dict "nucleotideSequences" $lapisNucleotideSequences "genes" $lapisGenes -}}
  {{- $result | toYaml -}}
{{- end -}}

{{- end -}}


{{- define "loculus.extractUniqueRawNucleotideSequenceNames" -}}
{{- $referenceGenomes := . -}}
{{- $segmentNames := list -}}

{{- range $suborganismName, $referenceGenomeRaw := $referenceGenomes -}}
  {{- $referenceGenome := include "loculus.generateReferenceGenome" $referenceGenomeRaw | fromYaml -}}

  {{- range $sequence := $referenceGenome.nucleotideSequences -}}
    {{- $segmentNames = append $segmentNames $sequence.name -}}
  {{- end -}}
{{- end -}}

segments:
{{ $segmentNames | uniq | toYaml | indent 2 -}}
{{- end -}}
