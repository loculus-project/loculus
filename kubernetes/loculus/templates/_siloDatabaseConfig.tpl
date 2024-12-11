{{- define "loculus.siloDatabaseShared" -}}
{{- $type := default "string" .type -}}
- type: {{ ($type | eq "timestamp") | ternary "int" (($type | eq "authors") | ternary "string" $type) }}
  {{- if .generateIndex }}
  generateIndex: {{ .generateIndex }}
  {{- end }}
  {{- if .enableSubstringSearch }}
  lapisAllowsRegexSearch: true
  {{- end }}
  {{- if .lineageSystem }}
  generateIndex: true
  generateLineageIndex: true
  {{- end }}
{{- end }}


{{- define "loculus.siloDatabaseConfig" }}
schema:
  metadata:
    - name: sample_id
      type: string
      generateIndex: false
    - name: batch_id
      type: string
      generateIndex: false
    - name: sequencing_well_position
      type: string
      generateIndex: false
    - name: location_code
      type: string
      generateIndex: false
    - name: sampling_date
      type: date
      generateIndex: false
    - name: sequencing_date
      type: string
      generateIndex: false
    - name: flow_cell_serial_number
      type: string
      generateIndex: false
    - name: read_length
      type: int
      generateIndex: false
    - name: primer_protocol
      type: string
      generateIndex: false
    - name: location_name
      type: string
      generateIndex: false
    - name: primer_protocol_name
      type: string
      generateIndex: false
    - name: nextclade_reference
      type: string
      generateIndex: false
    - name: read_id
      type: string
      generateIndex: false
  opennessLevel: OPEN
  instanceName: wise-sarsCoV2
  features: []
  primaryKey: read_id
{{- end }}
