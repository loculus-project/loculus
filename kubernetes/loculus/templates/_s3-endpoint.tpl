{{- define "loculus.s3Url" -}}
  {{- if $.Values.runDevelopmentS3 }}
    {{- if eq $.Values.environment "server" -}}
        {{- (printf "https://s3%s%s" $.Values.subdomainSeparator $.Values.host) -}}
    {{- else -}}
        {{- "http://localhost:8084" -}}
    {{- end -}}
  {{- else -}}
    {{- $.Values.s3.bucket.endpoint }}
  {{- end -}}
{{- end -}}

{{- define "loculus.s3UrlInternal" -}}
  {{- if $.Values.runDevelopmentS3 }}
    {{- if eq $.Values.environment "server" -}}
        {{- (printf "https://s3%s%s" $.Values.subdomainSeparator $.Values.host) -}}
    {{- else -}}
        {{- "http://loculus-minio-service:8084" -}}
    {{- end -}}
  {{- else -}}
    {{- $.Values.s3.bucket.endpoint }}
  {{- end -}}
{{- end -}}