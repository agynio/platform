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
} from '../proto/gen/agynio/api/runner/v1/runner_pb.js';
import type { ContainerOpts, Platform, SidecarOpts } from '../lib/types';

const PROP_AUTO_REMOVE = 'auto_remove';
const PROP_NETWORK_MODE = 'network_mode';
const PROP_TTY = 'tty';
const PROP_PRIVILEGED = 'privileged';
const PROP_LABELS_JSON = 'labels_json';
const PROP_CREATE_EXTRAS_JSON = 'create_extras_json';
const PROP_BIND_OPTIONS = 'bind_options';
const PROP_TTL_SECONDS = 'ttl_seconds';
const PROP_PLATFORM = 'platform';

const BOOL_TRUE = new Set(['1', 'true', 'yes', 'on']);

const isNonEmptyString = (value: string | undefined | null): value is string => typeof value === 'string' && value.length > 0;

const parseBool = (value?: string): boolean | undefined => {
  if (!value) return undefined;
  const normalized = value.trim().toLowerCase();
  if (normalized.length === 0) return undefined;
  if (BOOL_TRUE.has(normalized)) return true;
  if (normalized === '0' || normalized === 'false' || normalized === 'no' || normalized === 'off') return false;
  return undefined;
};

const parseIntSafe = (value?: string): number | undefined => {
  if (!value) return undefined;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
};

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

const composeEnvRecord = (env: EnvVar[]): Record<string, string> | undefined => {
  if (!env.length) return undefined;
  const record: Record<string, string> = {};
  for (const variable of env) {
    if (!isNonEmptyString(variable.name)) continue;
    record[variable.name] = variable.value ?? '';
  }
  return Object.keys(record).length > 0 ? record : undefined;
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

const composeBindString = (
  source: string,
  destination: string,
  options: string[],
): string => {
  const normalizedOptions = options.filter(
    (opt: string, index: number, arr: string[]) => opt.length > 0 && arr.indexOf(opt) === index,
  );
  if (normalizedOptions.length === 0) return `${source}:${destination}`;
  return `${source}:${destination}:${normalizedOptions.join(',')}`;
};

const ensureVolumeSpecName = (prefix: string, index: number): string => `${prefix}-${index}`;

const cloneAdditionalProperties = (input?: Record<string, string>): Record<string, string> => ({ ...(input ?? {}) });

export const workloadContainerPropKeys = {
  autoRemove: PROP_AUTO_REMOVE,
  networkMode: PROP_NETWORK_MODE,
  tty: PROP_TTY,
  privileged: PROP_PRIVILEGED,
  labelsJson: PROP_LABELS_JSON,
  createExtrasJson: PROP_CREATE_EXTRAS_JSON,
  bindOptions: PROP_BIND_OPTIONS,
} as const;

export const workloadRequestPropKeys = {
  ttlSeconds: PROP_TTL_SECONDS,
  platform: PROP_PLATFORM,
} as const;

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

export const startWorkloadRequestToContainerOpts = (request: StartWorkloadRequest): ContainerOpts => {
  const main = request.main as ContainerSpec | undefined;
  if (!main) throw new Error('main_container_spec_required');

  const opts: ContainerOpts = {};

  if (isNonEmptyString(main.image)) opts.image = main.image;
  if (isNonEmptyString(main.name)) opts.name = main.name;
  if (Array.isArray(main.cmd) && main.cmd.length > 0) opts.cmd = [...main.cmd];
  if (isNonEmptyString(main.entrypoint)) opts.entrypoint = main.entrypoint;
  if (isNonEmptyString(main.workingDir)) opts.workingDir = main.workingDir;

  const envRecord = composeEnvRecord(main.env ?? []);
  if (envRecord) opts.env = envRecord;

  const containerProps = cloneAdditionalProperties(main.additionalProperties);
  const autoRemove = parseBool(containerProps[PROP_AUTO_REMOVE]);
  if (typeof autoRemove === 'boolean') opts.autoRemove = autoRemove;

  if (isNonEmptyString(containerProps[PROP_NETWORK_MODE])) opts.networkMode = containerProps[PROP_NETWORK_MODE];

  const tty = parseBool(containerProps[PROP_TTY]);
  if (typeof tty === 'boolean') opts.tty = tty;

  const privilegedFromProps = parseBool(containerProps[PROP_PRIVILEGED]);
  if (typeof privilegedFromProps === 'boolean') opts.privileged = privilegedFromProps;
  else if (Array.isArray(main.requiredCapabilities) && main.requiredCapabilities.includes('privileged')) {
    opts.privileged = true;
  }

  if (isNonEmptyString(containerProps[PROP_LABELS_JSON])) {
    try {
      const parsed = JSON.parse(containerProps[PROP_LABELS_JSON]) as Record<string, string>;
      if (parsed && typeof parsed === 'object') opts.labels = parsed;
    } catch {
      // ignore malformed labels payloads
    }
  }

  if (isNonEmptyString(containerProps[PROP_CREATE_EXTRAS_JSON])) {
    try {
      const parsed = JSON.parse(containerProps[PROP_CREATE_EXTRAS_JSON]) as ContainerOpts['createExtras'];
      if (parsed && typeof parsed === 'object') opts.createExtras = parsed;
    } catch {
      // ignore malformed extras payloads
    }
  }

  const volumeMap = new Map<string, VolumeSpec>();
  for (const spec of request.volumes ?? []) {
    if (!spec?.name) continue;
    volumeMap.set(spec.name, spec);
  }

  const binds: string[] = [];
  const anonymous: string[] = [];

  for (const mount of main.mounts ?? []) {
    if (!mount?.volume) continue;
    const spec = volumeMap.get(mount.volume);
    if (!spec) continue;

    if (spec.kind === VolumeKind.EPHEMERAL) {
      if (isNonEmptyString(mount.mountPath)) anonymous.push(mount.mountPath);
      continue;
    }

    const source = isNonEmptyString(spec.persistentName) ? spec.persistentName : spec.name;
    if (!isNonEmptyString(source) || !isNonEmptyString(mount.mountPath)) continue;

    const rawOptions = spec.additionalProperties?.[PROP_BIND_OPTIONS];
    let optionList = rawOptions
      ? rawOptions
          .split(',')
          .map((opt: string) => opt.trim())
          .filter((opt: string) => opt.length > 0)
      : [];
    if (mount.readOnly) {
      if (!optionList.includes('ro')) optionList.push('ro');
    } else {
      optionList = optionList.filter((opt: string) => opt !== 'ro');
    }
    const bindString = composeBindString(source, mount.mountPath, optionList);
    binds.push(bindString);
  }

  if (binds.length > 0) opts.binds = binds;
  if (anonymous.length > 0) opts.anonymousVolumes = anonymous;

  const requestProps = cloneAdditionalProperties(request.additionalProperties);
  const ttl = parseIntSafe(requestProps[PROP_TTL_SECONDS]);
  if (typeof ttl === 'number') opts.ttlSeconds = ttl;

  if (isNonEmptyString(requestProps[PROP_PLATFORM])) {
    opts.platform = requestProps[PROP_PLATFORM] as Platform;
  }

  if (Array.isArray(request.sidecars) && request.sidecars.length > 0) {
    const sidecars: SidecarOpts[] = [];
    for (const spec of request.sidecars) {
      if (!spec) continue;
      const sidecarOpts: SidecarOpts = {
        image: isNonEmptyString(spec.image) ? spec.image : '',
      };
      if (Array.isArray(spec.cmd) && spec.cmd.length > 0) sidecarOpts.cmd = [...spec.cmd];
      const sidecarEnv = composeEnvRecord(spec.env ?? []);
      if (sidecarEnv) sidecarOpts.env = sidecarEnv;

      const props = cloneAdditionalProperties(spec.additionalProperties);
      const autoRemoveSidecar = parseBool(props[PROP_AUTO_REMOVE]);
      if (typeof autoRemoveSidecar === 'boolean') sidecarOpts.autoRemove = autoRemoveSidecar;

      if (isNonEmptyString(props[PROP_NETWORK_MODE])) sidecarOpts.networkMode = props[PROP_NETWORK_MODE];

      const privilegedSidecar = parseBool(props[PROP_PRIVILEGED]);
      if (typeof privilegedSidecar === 'boolean') sidecarOpts.privileged = privilegedSidecar;
      else if (Array.isArray(spec.requiredCapabilities) && spec.requiredCapabilities.includes('privileged')) {
        sidecarOpts.privileged = true;
      }

      if (isNonEmptyString(props[PROP_LABELS_JSON])) {
        try {
          const parsed = JSON.parse(props[PROP_LABELS_JSON]) as Record<string, string>;
          if (parsed && typeof parsed === 'object') sidecarOpts.labels = parsed;
        } catch {
          // ignore malformed labels payloads
        }
      }

      if (isNonEmptyString(props[PROP_CREATE_EXTRAS_JSON])) {
        try {
          const parsed = JSON.parse(props[PROP_CREATE_EXTRAS_JSON]) as SidecarOpts['createExtras'];
          if (parsed && typeof parsed === 'object') sidecarOpts.createExtras = parsed;
        } catch {
          // ignore malformed extras payloads
        }
      }

      const anonymous: string[] = [];
      for (const mount of spec.mounts ?? []) {
        if (!mount?.volume) continue;
        const volSpec = volumeMap.get(mount.volume);
        if (!volSpec) continue;
        if (volSpec.kind === VolumeKind.EPHEMERAL && isNonEmptyString(mount.mountPath)) {
          anonymous.push(mount.mountPath);
        }
      }
      if (anonymous.length > 0) sidecarOpts.anonymousVolumes = anonymous;

      sidecars.push(sidecarOpts);
    }
    if (sidecars.length > 0) opts.sidecars = sidecars;
  }

  return opts;
};
