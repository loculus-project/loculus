{{/*
Access policy for instances that keep their data behind the login.

`registrationAllowed` and `robotsNoindexHeader` default to what `requireLogin` implies, but stay
overridable: leaving them unset in values.yaml is what lets the default follow the flag. Helm's
`default` cannot be used for this, because it treats an explicit `false` as unset.
*/}}

{{/* Self registration is off on a private instance unless an operator asks for it. An instance
     that gates its data but lets anyone sign up is a legitimate choice - it buys attribution and
     blocks anonymous scraping - so this is a default, not a constraint. */}}
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
  {{- if $.Values.readOnlyMode -}}
    {{- fail "requireLogin cannot be combined with readOnlyMode: read-only mode forces every session to be logged out, so every gated route would be refused." -}}
  {{- end -}}
  {{- if $.Values.disableWebsite -}}
    {{- fail "requireLogin cannot be combined with disableWebsite: the website serves the /lapis proxy that is the only way in to LAPIS once it has no public host." -}}
  {{- end -}}
{{- end -}}
{{- end -}}
