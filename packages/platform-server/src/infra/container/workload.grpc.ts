import { create } from '@bufbuild/protobuf';
import {
  ContainerSpec,
  ContainerSpecSchema,
  EnvVar,
  EnvVarSchema,
  StartWorkloadRequest,
  StartWorkloadRequestSchema,
  VolumeKind,
  VolumeMount,
  VolumeMountSchema,
  VolumeSpec,
  VolumeSpecSchema,
} from '../../proto/gen/agynio/api/runner/v1/runner_pb.js';
import type { ContainerOpts, SidecarOpts } from './dockerRunner.types';

const PROP_AUTO_REMOVE = 'auto_remove';
const PROP_NETWORK_MODE = 'network_mode';
const PROP_TTY = 'tty';
const PROP_PRIVILEGED = 'privileged';
const PROP_LABELS_JSON = 'labels_json';
const PROP_CREATE_EXTRAS_JSON = 'create_extras_json';
const PROP_BIND_OPTIONS = 'bind_options';
const PROP_TTL_SECONDS = 'ttl_seconds';
const PROP_PLATFORM = 'platform';

const isNonEmptyString = (value: string | undefined | null): value is string => typeof value === 'string' && value.length > 0;

const normalizeEnv = (env?: ContainerOpts['env']): EnvVar[] => {
  if (!env) return [];
  if (Array.isArray(env)) {
    return env
      .map((entry: string) => {
        const idx = entry.indexOf('=');
        if (idx === -1) return create(EnvVarSchema, { name: entry, value: '' });
        return create(EnvVarSchema, { name: entry.slice(0, idx), value: entry.slice(idx + 1) });
      })
      .filter((item) => item.name.length > 0);
  }
  return Object.entries(env)
    .map(([name, value]: [string, unknown]) => create(EnvVarSchema, { name, value: String(value) }))
    .filter((item: EnvVar) => item.name.length > 0);
};

const parseBind = (
  bind: string,
): { source: string; destination: string; options: string[] } | null => {
  if (!bind || typeof bind !== 'string') return null;
  const segments = bind.split(':');
  if (segments.length < 2) return null;
  const source = segments[0] ?? '';
  const destination = segments[1] ?? '';
  const optionsRaw = segments.slice(2).join(':');
  const options = optionsRaw
    ? optionsRaw
        .split(',')
        .map((opt: string) => opt.trim())
        .filter((opt: string) => opt.length > 0)
    : [];
  if (!destination) return null;
  return { source, destination, options };
};

const ensureVolumeSpecName = (prefix: string, index: number): string => `${prefix}-${index}`;

export const containerOptsToStartWorkloadRequest = (opts: ContainerOpts): StartWorkloadRequest => {
  const additionalContainerProps: Record<string, string> = {};
  if (typeof opts.autoRemove === 'boolean') additionalContainerProps[PROP_AUTO_REMOVE] = String(opts.autoRemove);
  if (typeof opts.networkMode === 'string') additionalContainerProps[PROP_NETWORK_MODE] = opts.networkMode;
  if (typeof opts.tty === 'boolean') additionalContainerProps[PROP_TTY] = String(opts.tty);
  if (typeof opts.privileged === 'boolean') additionalContainerProps[PROP_PRIVILEGED] = String(opts.privileged);
  if (opts.labels) additionalContainerProps[PROP_LABELS_JSON] = JSON.stringify(opts.labels);
  if (opts.createExtras) additionalContainerProps[PROP_CREATE_EXTRAS_JSON] = JSON.stringify(opts.createExtras);

  const volumes: VolumeSpec[] = [];
  const mainMounts: VolumeMount[] = [];
  let volumeIndex = 0;

  const registerVolume = (
    spec: VolumeSpec,
    mount: VolumeMount,
    target: VolumeMount[],
  ) => {
    volumes.push(spec);
    target.push(mount);
  };

  if (Array.isArray(opts.binds)) {
    for (const bind of opts.binds) {
      const parsed = parseBind(bind);
      if (!parsed) continue;
      const name = ensureVolumeSpecName('bind', ++volumeIndex);
      const isReadOnly = parsed.options.includes('ro');
      const spec = create(VolumeSpecSchema, {
        name,
        kind: VolumeKind.NAMED,
        persistentName: parsed.source,
        additionalProperties:
          parsed.options.length > 0 ? { [PROP_BIND_OPTIONS]: parsed.options.join(',') } : {},
      });
      const mount = create(VolumeMountSchema, {
        volume: name,
        mountPath: parsed.destination,
        readOnly: isReadOnly,
      });
      registerVolume(spec, mount, mainMounts);
    }
  }

  if (Array.isArray(opts.anonymousVolumes)) {
    for (const path of opts.anonymousVolumes) {
      if (!isNonEmptyString(path)) continue;
      const name = ensureVolumeSpecName('ephemeral', ++volumeIndex);
      const spec = create(VolumeSpecSchema, {
        name,
        kind: VolumeKind.EPHEMERAL,
        persistentName: '',
        additionalProperties: {},
      });
      const mount = create(VolumeMountSchema, {
        volume: name,
        mountPath: path,
        readOnly: false,
      });
      registerVolume(spec, mount, mainMounts);
    }
  }

  const main = create(ContainerSpecSchema, {
    image: opts.image ?? '',
    name: opts.name ?? '',
    cmd: opts.cmd ?? [],
    entrypoint: opts.entrypoint ?? '',
    env: normalizeEnv(opts.env),
    workingDir: opts.workingDir ?? '',
    mounts: mainMounts,
    requiredCapabilities: opts.privileged ? ['privileged'] : [],
    additionalProperties: additionalContainerProps,
  });

  const mapSidecar = (sidecar: SidecarOpts | undefined): ContainerSpec | undefined => {
    if (!sidecar) return undefined;
    const sidecarProps: Record<string, string> = {};
    if (typeof sidecar.autoRemove === 'boolean') sidecarProps[PROP_AUTO_REMOVE] = String(sidecar.autoRemove);
    if (typeof sidecar.networkMode === 'string') sidecarProps[PROP_NETWORK_MODE] = sidecar.networkMode;
    if (typeof sidecar.privileged === 'boolean') sidecarProps[PROP_PRIVILEGED] = String(sidecar.privileged);
    if (sidecar.labels) sidecarProps[PROP_LABELS_JSON] = JSON.stringify(sidecar.labels);
    if (sidecar.createExtras) sidecarProps[PROP_CREATE_EXTRAS_JSON] = JSON.stringify(sidecar.createExtras);

    const mounts: VolumeMount[] = [];
    if (Array.isArray(sidecar.anonymousVolumes)) {
      for (const path of sidecar.anonymousVolumes) {
        if (!isNonEmptyString(path)) continue;
        const name = ensureVolumeSpecName('ephemeral', ++volumeIndex);
        const spec = create(VolumeSpecSchema, {
          name,
          kind: VolumeKind.EPHEMERAL,
          persistentName: '',
          additionalProperties: {},
        });
        const mount = create(VolumeMountSchema, {
          volume: name,
          mountPath: path,
          readOnly: false,
        });
        registerVolume(spec, mount, mounts);
      }
    }

    return create(ContainerSpecSchema, {
      image: sidecar.image ?? '',
      name: '',
      cmd: sidecar.cmd ?? [],
      entrypoint: '',
      env: normalizeEnv(sidecar.env),
      workingDir: '',
      mounts,
      requiredCapabilities: sidecar.privileged ? ['privileged'] : [],
      additionalProperties: sidecarProps,
    });
  };

  const sidecars = Array.isArray(opts.sidecars)
    ? opts.sidecars
        .map((sidecar: SidecarOpts) => mapSidecar(sidecar))
        .filter((spec): spec is ContainerSpec => spec !== undefined)
    : [];

  const requestAdditional: Record<string, string> = {};
  if (typeof opts.ttlSeconds === 'number' && Number.isFinite(opts.ttlSeconds)) {
    requestAdditional[PROP_TTL_SECONDS] = String(Math.trunc(opts.ttlSeconds));
  }
  if (opts.platform) {
    requestAdditional[PROP_PLATFORM] = opts.platform;
  }

  return create(StartWorkloadRequestSchema, {
    main,
    sidecars,
    volumes,
    additionalProperties: requestAdditional,
  });
};
