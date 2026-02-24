{{- define "platform-ui.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{- define "platform-ui.fullname" -}}
{{- if .Values.fullnameOverride -}}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" -}}
{{- else -}}
{{- $name := include "platform-ui.name" . -}}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" -}}
{{- end -}}
{{- end -}}

{{- define "platform-ui.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" -}}
{{- end -}}

{{- define "platform-ui.labels" -}}
helm.sh/chart: {{ include "platform-ui.chart" . }}
{{ include "platform-ui.selectorLabels" . }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- if .Chart.AppVersion }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}
{{- end -}}

{{- define "platform-ui.selectorLabels" -}}
app.kubernetes.io/name: {{ include "platform-ui.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end -}}

{{- define "platform-ui.nginxConfigName" -}}
{{- printf "%s-nginx" (include "service-base.fullname" .) -}}
{{- end -}}

{{- define "platform-ui.render" -}}
{{- $template := .template -}}
{{- $root := .context -}}
{{- $values := deepCopy $root.Values -}}
{{- $nginx := $values.nginx | default (dict) -}}
{{- $config := $nginx.config | default (dict) -}}
{{- if ($config.enabled | default false) -}}
  {{- $mount := dict "name" "nginx-template" "sourceName" (include "platform-ui.nginxConfigName" $root) "type" "configMap" "mountPath" "/etc/nginx/templates/default.conf.template" "subPath" "default.conf.template" "readOnly" true -}}
  {{- $mounts := $values.configMounts | default (list) -}}
  {{- $mounts = append $mounts $mount -}}
  {{- $values = set $values "configMounts" $mounts -}}
{{- end -}}
{{- $ctx := dict "Values" $values "Chart" $root.Chart "Capabilities" $root.Capabilities "Release" $root.Release "Files" $root.Files "Template" $root.Template -}}
{{- include $template $ctx -}}
{{- end -}}
