{{/* Returns the fully qualified image reference for the DinD sidecar */}}
{{- define "docker-runner.dindImage" -}}
{{- $root := . -}}
{{- $values := $root.Values | default (dict) -}}
{{- $runtime := $values.runtime | default (dict) -}}
{{- $dind := $runtime.dind | default (dict) -}}
{{- $image := $dind.image | default (dict) -}}
{{- $registry := "" -}}
{{- if ($values.global).imageRegistry -}}
  {{- $registry = ($values.global).imageRegistry -}}
{{- else if $image.registry -}}
  {{- $registry = $image.registry -}}
{{- end -}}
{{- $registry = trimSuffix "/" $registry -}}
{{- $repository := default "docker" $image.repository -}}
{{- $tag := default "24-dind" $image.tag -}}
{{- if $registry -}}
{{ printf "%s/%s:%s" $registry $repository $tag }}
{{- else -}}
{{ printf "%s:%s" $repository $tag }}
{{- end -}}
{{- end -}}

{{/* Renders the deployment using runtime-aware values */}}
{{- define "docker-runner.deployment" -}}
{{- $ctx := deepCopy . -}}
{{- $values := deepCopy .Values -}}
{{- $runtime := $values.runtime | default (dict) -}}
{{- $mode := default "dind" $runtime.mode -}}

{{- $extraVolumes := list -}}
{{- range $values.extraVolumes }}
  {{- $extraVolumes = append $extraVolumes (deepCopy .) -}}
{{- end -}}

{{- $extraVolumeMounts := list -}}
{{- range $values.extraVolumeMounts }}
  {{- $extraVolumeMounts = append $extraVolumeMounts (deepCopy .) -}}
{{- end -}}

{{- $extraContainers := list -}}
{{- range $values.extraContainers }}
  {{- $extraContainers = append $extraContainers (deepCopy .) -}}
{{- end -}}

{{- $env := list -}}
{{- range $values.env }}
  {{- $env = append $env (deepCopy .) -}}
{{- end -}}

{{- $socketPath := "/var/run/docker.sock" -}}

{{- if eq $mode "dind" -}}
  {{- $dind := $runtime.dind | default (dict) -}}
  {{- $run := $dind.sharedRunVolume | default (dict) -}}
  {{- $runName := default "docker-runner-run" $run.name -}}
  {{- $runMountPath := default "/var/run/docker" $run.mountPath -}}
  {{- $runVolume := dict "name" $runName -}}
  {{- if $run.emptyDir -}}
    {{- $_ := set $runVolume "emptyDir" $run.emptyDir -}}
  {{- else if $run.persistentVolumeClaim -}}
    {{- $_ := set $runVolume "persistentVolumeClaim" $run.persistentVolumeClaim -}}
  {{- else if $run.hostPath -}}
    {{- $_ := set $runVolume "hostPath" $run.hostPath -}}
  {{- else -}}
    {{- $_ := set $runVolume "emptyDir" (dict) -}}
  {{- end -}}
  {{- $hasRunVolume := false -}}
  {{- range $extraVolumes -}}
    {{- if and (kindIs "map" .) (hasKey . "name") (eq (index . "name") $runName) }}
      {{- $hasRunVolume = true -}}
    {{- end -}}
  {{- end -}}
  {{- if not $hasRunVolume -}}
    {{- $extraVolumes = append $extraVolumes $runVolume -}}
  {{- end -}}

  {{- $mainRunMount := dict "name" $runName "mountPath" $runMountPath -}}
  {{- if hasKey $run "readOnly" -}}
    {{- $_ := set $mainRunMount "readOnly" $run.readOnly -}}
  {{- end -}}
  {{- if hasKey $run "subPath" -}}
    {{- $_ := set $mainRunMount "subPath" $run.subPath -}}
  {{- end -}}
  {{- $hasRunMount := false -}}
  {{- range $extraVolumeMounts -}}
    {{- if and (kindIs "map" .) (hasKey . "name") (hasKey . "mountPath") (eq (index . "name") $runName) (eq (index . "mountPath") $runMountPath) }}
      {{- $hasRunMount = true -}}
    {{- end -}}
  {{- end -}}
  {{- if not $hasRunMount -}}
    {{- $extraVolumeMounts = append $extraVolumeMounts $mainRunMount -}}
  {{- end -}}

  {{- $socketPath = printf "%s/docker.sock" $runMountPath -}}

  {{- $storage := $dind.storageVolume | default (dict) -}}
  {{- if $storage.mountPath -}}
    {{- $storageName := default "docker-runner-lib" $storage.name -}}
    {{- $storageVolume := dict "name" $storageName -}}
    {{- if $storage.emptyDir -}}
      {{- $_ := set $storageVolume "emptyDir" $storage.emptyDir -}}
    {{- else if $storage.persistentVolumeClaim -}}
      {{- $_ := set $storageVolume "persistentVolumeClaim" $storage.persistentVolumeClaim -}}
    {{- else if $storage.hostPath -}}
      {{- $_ := set $storageVolume "hostPath" $storage.hostPath -}}
    {{- else -}}
      {{- $_ := set $storageVolume "emptyDir" (dict) -}}
    {{- end -}}
    {{- $hasStorageVolume := false -}}
    {{- range $extraVolumes -}}
      {{- if and (kindIs "map" .) (hasKey . "name") (eq (index . "name") $storageName) }}
        {{- $hasStorageVolume = true -}}
      {{- end -}}
    {{- end -}}
    {{- if not $hasStorageVolume -}}
      {{- $extraVolumes = append $extraVolumes $storageVolume -}}
    {{- end -}}
  {{- end -}}

  {{- $sidecar := dict "name" (default "docker-daemon" $dind.name) -}}
  {{- $_ := set $sidecar "image" (include "docker-runner.dindImage" $ctx) -}}
  {{- $imagePullPolicy := ($dind.image).pullPolicy | default "IfNotPresent" -}}
  {{- $_ := set $sidecar "imagePullPolicy" $imagePullPolicy -}}

  {{- if $dind.command -}}
    {{- $_ := set $sidecar "command" $dind.command -}}
  {{- end -}}

  {{- $args := $dind.args -}}
  {{- if not $args -}}
    {{- $args = list (printf "--host=unix://%s" $socketPath) "--host=tcp://0.0.0.0:2375" -}}
  {{- end -}}
  {{- if $args -}}
    {{- $_ := set $sidecar "args" $args -}}
  {{- end -}}

  {{- $dindEnv := list -}}
  {{- $hasTlsEnv := false -}}
  {{- range $dind.env -}}
    {{- $entry := deepCopy . -}}
    {{- if and (kindIs "map" $entry) (eq ($entry.name | default "") "DOCKER_TLS_CERTDIR") -}}
      {{- $hasTlsEnv = true -}}
    {{- end -}}
    {{- $dindEnv = append $dindEnv $entry -}}
  {{- end -}}
  {{- if not $hasTlsEnv -}}
    {{- $dindEnv = append $dindEnv (dict "name" "DOCKER_TLS_CERTDIR" "value" "") -}}
  {{- end -}}
  {{- if $dindEnv -}}
    {{- $_ := set $sidecar "env" $dindEnv -}}
  {{- end -}}

  {{- if $dind.resources -}}
    {{- $_ := set $sidecar "resources" $dind.resources -}}
  {{- end -}}

  {{- $securityContext := deepCopy ($dind.securityContext | default (dict)) -}}
  {{- if not (hasKey $securityContext "privileged") -}}
    {{- $_ := set $securityContext "privileged" true -}}
  {{- end -}}
  {{- if not (hasKey $securityContext "allowPrivilegeEscalation") -}}
    {{- $_ := set $securityContext "allowPrivilegeEscalation" true -}}
  {{- end -}}
  {{- if $securityContext -}}
    {{- $_ := set $sidecar "securityContext" $securityContext -}}
  {{- end -}}

  {{- $sidecarMounts := list -}}
  {{- $runMountForSidecar := dict "name" $runName "mountPath" $runMountPath -}}
  {{- if hasKey $run "readOnly" -}}
    {{- $_ := set $runMountForSidecar "readOnly" $run.readOnly -}}
  {{- end -}}
  {{- if hasKey $run "subPath" -}}
    {{- $_ := set $runMountForSidecar "subPath" $run.subPath -}}
  {{- end -}}
  {{- $sidecarMounts = append $sidecarMounts $runMountForSidecar -}}

  {{- if $storage.mountPath -}}
    {{- $storageMount := dict "name" (default "docker-runner-lib" $storage.name) "mountPath" $storage.mountPath -}}
    {{- if hasKey $storage "readOnly" -}}
      {{- $_ := set $storageMount "readOnly" $storage.readOnly -}}
    {{- end -}}
    {{- if hasKey $storage "subPath" -}}
      {{- $_ := set $storageMount "subPath" $storage.subPath -}}
    {{- end -}}
    {{- $sidecarMounts = append $sidecarMounts $storageMount -}}
  {{- end -}}

  {{- range $dind.extraVolumeMounts -}}
    {{- $sidecarMounts = append $sidecarMounts (deepCopy .) -}}
  {{- end -}}

  {{- if $sidecarMounts -}}
    {{- $_ := set $sidecar "volumeMounts" $sidecarMounts -}}
  {{- end -}}

  {{- $extraContainers = append $extraContainers $sidecar -}}

{{- else if eq $mode "hostSocket" -}}
  {{- $host := $runtime.hostSocket | default (dict) -}}
  {{- $hostName := default "docker-runner-host" $host.name -}}
  {{- $hostPath := dict "path" (default "/var/run/docker.sock" $host.path) -}}
  {{- if and (hasKey $host "hostPathType") ($host.hostPathType | default "" | ne "") -}}
    {{- $_ := set $hostPath "type" $host.hostPathType -}}
  {{- end -}}
  {{- $hostVolume := dict "name" $hostName "hostPath" $hostPath -}}
  {{- $hasHostVolume := false -}}
  {{- range $extraVolumes -}}
    {{- if and (kindIs "map" .) (hasKey . "name") (eq (index . "name") $hostName) }}
      {{- $hasHostVolume = true -}}
    {{- end -}}
  {{- end -}}
  {{- if not $hasHostVolume -}}
    {{- $extraVolumes = append $extraVolumes $hostVolume -}}
  {{- end -}}

  {{- $mountPath := default "/var/run/docker.sock" $host.mountPath -}}
  {{- $hostMount := dict "name" $hostName "mountPath" $mountPath -}}
  {{- if hasKey $host "readOnly" -}}
    {{- $_ := set $hostMount "readOnly" $host.readOnly -}}
  {{- end -}}
  {{- if hasKey $host "mountPropagation" -}}
    {{- $_ := set $hostMount "mountPropagation" $host.mountPropagation -}}
  {{- end -}}
  {{- $hasHostMount := false -}}
  {{- range $extraVolumeMounts -}}
    {{- if and (kindIs "map" .) (hasKey . "name") (hasKey . "mountPath") (eq (index . "name") $hostName) (eq (index . "mountPath") $mountPath) }}
      {{- $hasHostMount = true -}}
    {{- end -}}
  {{- end -}}
  {{- if not $hasHostMount -}}
    {{- $extraVolumeMounts = append $extraVolumeMounts $hostMount -}}
  {{- end -}}

  {{- $socketPath = $mountPath -}}

{{- else -}}
  {{- fail (printf "docker-runner: unsupported runtime.mode '%s'" $mode) -}}
{{- end -}}

{{- $envWithSocket := list -}}
{{- $hasSocketEnv := false -}}
{{- range $env -}}
  {{- $entry := deepCopy . -}}
  {{- if and (kindIs "map" $entry) (eq ($entry.name | default "") "DOCKER_SOCKET") -}}
    {{- if hasKey $entry "valueFrom" -}}
      {{- fail "docker-runner: DOCKER_SOCKET env cannot use valueFrom" -}}
    {{- end -}}
    {{- $_ := set $entry "value" $socketPath -}}
    {{- $hasSocketEnv = true -}}
  {{- end -}}
  {{- $envWithSocket = append $envWithSocket $entry -}}
{{- end -}}
{{- if not $hasSocketEnv -}}
  {{- $envWithSocket = append $envWithSocket (dict "name" "DOCKER_SOCKET" "value" $socketPath) -}}
{{- end -}}

{{- $_ := set $values "env" $envWithSocket -}}
{{- $_ := set $values "extraVolumes" $extraVolumes -}}
{{- $_ := set $values "extraVolumeMounts" $extraVolumeMounts -}}
{{- $_ := set $values "extraContainers" $extraContainers -}}

{{- $_ := set $ctx "Values" $values -}}
{{- include "service-base.deployment" $ctx -}}
{{- end -}}
