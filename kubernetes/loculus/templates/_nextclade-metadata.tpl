{{/* Defines standard nextclade metadata fields */}}
{{- define "loculus.nextcladeMetadata" }}
fields:
  - name: length
    type: integer
  - name: sequence_hash
    type: string
  - name: total_snps
    type: integer
  - name: total_inserted_nucs
    type: integer
  - name: total_deleted_nucs
    type: integer
  - name: total_ambiguous_nucs
    type: integer
  - name: total_unknown_nucs
    type: integer
  - name: total_frame_shifts
    type: integer
  - name: frame_shifts
    type: string
  - name: completeness
    type: float
  - name: total_stop_codons
    type: integer
  - name: stop_codons
    type: string
{{- end}}
