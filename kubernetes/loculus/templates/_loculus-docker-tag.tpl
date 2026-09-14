{{- define "loculus.dockerTag" }}
{{- if .sha }}
{{- printf "commit-%v" .sha }}
{{- else }}
{{- $dockerTag := (eq (.branch | default "main") "main") | ternary "latest" .branch -}}
{{- regexReplaceAll "/" $dockerTag "-" }}
{{- end }}
{{- end }}

{{/*
Resolve the full image reference (repository:tag) for a named image.
Expects a dict:
  name               - the key under `images` in values (e.g. "backend")
  defaultRepository  - fallback repository used if `images.<name>.repository` is unset
  defaultTag         - (optional) fallback tag; defaults to the resolved loculus.dockerTag
  values             - root .Values
Overrides per image are taken from `images.<name>.repository` / `images.<name>.tag`.
*/}}
{{- define "loculus.image" -}}
{{-   $name := .name -}}
{{-   $defaultRepository := .defaultRepository -}}
{{-   $values := .values -}}
{{-   $imageConfig := index ($values.images | default dict) $name | default dict -}}
{{-   $repo := $imageConfig.repository | default $defaultRepository -}}
{{-   $fallbackTag := .defaultTag | default (include "loculus.dockerTag" $values) -}}
{{-   $tag := $imageConfig.tag | default $fallbackTag -}}
{{-   printf "%s:%s" $repo $tag -}}
{{- end -}}

{{/*
Resolve the image pull policy for a named image.
Expects a dict:
  name   - the key under `images` in values (e.g. "backend")
  values - root .Values
Falls back to the global `imagePullPolicy` when `images.<name>.pullPolicy` is unset.
*/}}
{{- define "loculus.imagePullPolicy" -}}
{{-   $name := .name -}}
{{-   $values := .values -}}
{{-   $imageConfig := index ($values.images | default dict) $name | default dict -}}
{{-   $imageConfig.pullPolicy | default $values.imagePullPolicy -}}
{{- end -}}
