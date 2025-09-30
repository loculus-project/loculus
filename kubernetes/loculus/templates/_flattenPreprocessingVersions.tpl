{{- define "loculus.flattenPreprocessingVersions" -}}
{{- $preprocessing := . -}}
{{- $flattened := list -}}
{{- $seen := dict -}}
{{- range $pc := $preprocessing -}}
  {{- $versions := (kindIs "slice" $pc.version | ternary $pc.version (list $pc.version)) -}}
  {{- range $v := $versions -}}
    {{- if hasKey $seen (toString $v) -}}
      {{- fail (printf "Duplicate preprocessing pipeline version %v found in organism configuration" $v) -}}
    {{- end -}}
    {{- $_ := set $seen (toString $v) true -}}
    {{- $copy := deepCopy $pc -}}
    {{- $_ := set $copy "version" $v -}}
    {{- $flattened = append $flattened $copy -}}
  {{- end -}}
{{- end -}}
{{- dict "items" $flattened | toJson -}}
{{- end -}}
