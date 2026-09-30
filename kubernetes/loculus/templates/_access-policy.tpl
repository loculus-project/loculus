{{/*
Access policy for instances that keep their data behind the login.

`registrationAllowed` and `robotsNoindexHeader` default to what `requireLogin` implies, but stay
overridable: leaving them unset in values.yaml is what lets the default follow the flag. Helm's
`default` cannot be used for this, because it treats an explicit `false` as unset.
*/}}

{{/* Public instances allow registration by default. Restricted instances require operator-approved
     accounts; validateAccessPolicy rejects enabling self-registration in that mode. */}}
{{- define "loculus.registrationAllowed" -}}
{{- if kindIs "invalid" $.Values.auth.registrationAllowed -}}
{{- not $.Values.requireLogin -}}
{{- else -}}
{{- $.Values.auth.registrationAllowed -}}
{{- end -}}
{{- end -}}

{{/* Nothing on a private instance is worth indexing, and the crawler cannot read it anyway. */}}
{{- define "loculus.robotsNoindexHeader" -}}
{{- if kindIs "invalid" $.Values.robotsNoindexHeader -}}
{{- $.Values.requireLogin -}}
{{- else -}}
{{- $.Values.robotsNoindexHeader -}}
{{- end -}}
{{- end -}}

{{/* Combinations that cannot work, caught at render time rather than in a running cluster. */}}
{{- define "loculus.validateAccessPolicy" -}}
{{- if $.Values.requireLogin -}}
  {{- if $.Values.disableBackend -}}
    {{- fail "requireLogin requires the backend authorization service; set disableBackend=false." -}}
  {{- end -}}
  {{- if (default dict $.Values.public).lapisUrlTemplate -}}
    {{- fail "requireLogin manages the public LAPIS URL; remove public.lapisUrlTemplate." -}}
  {{- end -}}
  {{- if $.Values.s3.enabled -}}
    {{- fail "requireLogin does not yet support S3 file sharing; set s3.enabled=false." -}}
  {{- end -}}
  {{- if ne (include "loculus.registrationAllowed" $) "false" -}}
    {{- fail "requireLogin requires auth.registrationAllowed=false: accounts must be operator-approved." -}}
  {{- end -}}
  {{- if not $.Values.disableEnaSubmission -}}
    {{- fail "requireLogin does not yet support ENA deposition; set disableEnaSubmission=true." -}}
  {{- end -}}
  {{- if $.Values.readOnlyMode -}}
    {{- fail "requireLogin cannot be combined with readOnlyMode: read-only mode forces every session to be logged out, so every gated route would be refused." -}}
  {{- end -}}
  {{- if $.Values.disableWebsite -}}
    {{- fail "requireLogin cannot be combined with disableWebsite: the website serves the /lapis proxy that is the only way in to LAPIS once it has no public host." -}}
  {{- end -}}
{{- end -}}
{{- end -}}
