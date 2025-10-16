import Docker, { ContainerCreateOptions, Exec } from 'dockerode';
import { ContainerEntity } from '../entities/container.entity';
import { LoggerService } from './logger.service';
import { PLATFORM_LABEL, type Platform } from '../constants.js';
import { isExecTimeoutError, ExecTimeoutError, ExecIdleTimeoutError, isExecIdleTimeoutError } from '../utils/execTimeout';
import type { ContainerRegistryService } from './containerRegistry.service';

const DEFAULT_IMAGE = 'mcr.microsoft.com/vscode/devcontainers/base';

export type ContainerOpts = {
  image?: string;
  name?: string;
  cmd?: string[];
  entrypoint?: string;
  env?: Record<string, string> | string[];
  workingDir?: string;
  autoRemove?: boolean; // --rm behavior
  binds?: string[]; // hostPath:containerPath[:ro]
  networkMode?: string;
  tty?: boolean;
  labels?: Record<string, string>;
  platform?: Platform;
  privileged?: boolean;
  /** Container paths to create as anonymous volumes (top-level Volumes mapping) */
  anonymousVolumes?: string[];
  /** Advanced: raw dockerode create options merged last (escape hatch) */
  createExtras?: Partial<ContainerCreateOptions>;
  /** Optional TTL for last-used based cleanup (seconds). <=0 disables cleanup */
  ttlSeconds?: number;
};

/**
 * ContainerService provides a thin wrapper around dockerode for:
 *  - Ensuring (pulling) images
 *  - Creating & starting containers
 *  - Executing commands inside running containers (capturing stdout/stderr)
 *  - Stopping & removing containers
 *
 * This intentionally avoids opinionated higher-level orchestration so it can be
 * used flexibly by tools/agents. All methods log their high-level actions.
 *
 * Usage example:
 * const svc = new ContainerService(logger);
 * const c = await svc.start({ image: "node:20-alpine", cmd: ["sleep", "3600"], autoRemove: true });
 * const result = await c.exec("node -v");
 * await c.stop();
 * await c.remove();
 */
export class ContainerService {
  private docker: Docker;
  private registry?: ContainerRegistryService;

  constructor(private logger: LoggerService) {
    this.docker = new Docker({
      socketPath: process.env.DOCKER_SOCKET
    });
  }

  /** Attach registry service for persistence and last-used tracking */
  setRegistry(registry: ContainerRegistryService) {
    this.registry = registry;
  }

  /** Public helper to touch last-used timestamp for a container */
  async touchLastUsed(containerId: string): Promise<void> {
    try {
      await this.registry?.updateLastUsed(containerId, new Date());
    } catch (e: unknown) {
      const msg = e && typeof e === 'object' && 'message' in e ? String((e as Error).message) : String(e);
      this.logger.debug(`touchLastUsed failed for cid=${containerId.substring(0, 12)} ${msg}`);
    }
  }

  /** Pull an image; if platform is specified, pull even when image exists to ensure correct arch. */
  async ensureImage(image: string, platform?: Platform): Promise<void> {
    this.logger.info(`Ensuring image '${image}' is available locally`);
    // Check if image exists
    try {
      await this.docker.getImage(image).inspect();
      this.logger.debug(`Image '${image}' already present`);
      // When platform is provided, still pull to ensure the desired arch variant is present.
      if (!platform) return;
    } catch {
      this.logger.info(`Image '${image}' not found locally. Pulling...`);
    }

    await new Promise<void>((resolve, reject) => {
      type PullOpts = { platform?: string };
      const cb = (err: Error | undefined, stream?: NodeJS.ReadableStream) => {
        if (err) return reject(err);
        if (!stream) return reject(new Error('No pull stream returned'));
        this.docker.modem.followProgress(
          stream,
          (doneErr?: unknown) => {
            if (doneErr) return reject(doneErr);
            this.logger.info(`Finished pulling image '${image}'`);
            resolve();
          },
          (event: { status?: string; id?: string }) => {
            if (event?.status && event?.id) {
              this.logger.debug(`${event.id}: ${event.status}`);
            } else if (event?.status) {
              this.logger.debug(event.status);
            }
          },
        );
      };
      // Use overload that accepts optional opts. Undefined maps to (image, cb).
      this.docker.pull(image, platform ? ({ platform } as PullOpts) : undefined, cb);
    });
  }

  /**
   * Start a new container and return a ContainerEntity representing it.
   */
  async start(opts?: ContainerOpts): Promise<ContainerEntity> {
    const defaults: Partial<ContainerOpts> = { image: DEFAULT_IMAGE, autoRemove: true, tty: false };
    const optsWithDefaults = { ...defaults, ...opts };

    await this.ensureImage(optsWithDefaults.image!, optsWithDefaults.platform);

    const Env: string[] | undefined = Array.isArray(optsWithDefaults.env)
      ? optsWithDefaults.env
      : optsWithDefaults.env
        ? Object.entries(optsWithDefaults.env).map(([k, v]) => `${k}=${v}`)
        : undefined;

    // dockerode forwards unknown top-level options (e.g., name, platform) as query params
    type CreateOptsWithPlatform = ContainerCreateOptions & { name?: string; platform?: string };
    const createOptions: CreateOptsWithPlatform = {
      Image: optsWithDefaults.image,
      name: optsWithDefaults.name,
      platform: optsWithDefaults.platform,
      Cmd: optsWithDefaults.cmd,
      Env,
      WorkingDir: optsWithDefaults.workingDir,
      HostConfig: {
        AutoRemove: optsWithDefaults.autoRemove ?? false,
        Binds: optsWithDefaults.binds,
        NetworkMode: optsWithDefaults.networkMode,
        Privileged: optsWithDefaults.privileged ?? false,
      },
      Volumes:
        optsWithDefaults.anonymousVolumes && optsWithDefaults.anonymousVolumes.length > 0
          ? Object.fromEntries(optsWithDefaults.anonymousVolumes.map((p) => [p, {} as Record<string, never>]))
          : undefined,
      Tty: optsWithDefaults.tty ?? false,
      AttachStdout: true,
      AttachStderr: true,
      Labels: {
        ...(optsWithDefaults.labels || {}),
        ...(optsWithDefaults.platform ? { [PLATFORM_LABEL]: optsWithDefaults.platform } : {}),
      },
    };

    // Merge createExtras last (shallow, with nested HostConfig merged shallowly as well)
    if (optsWithDefaults.createExtras) {
      const extras: Partial<ContainerCreateOptions> = optsWithDefaults.createExtras;
      if (extras.HostConfig) {
        createOptions.HostConfig = { ...(createOptions.HostConfig || {}), ...extras.HostConfig };
      }
      const { HostConfig: _hc, ...rest } = extras;
      Object.assign(createOptions, rest);
    }

    this.logger.info(
      `Creating container from '${optsWithDefaults.image}'${optsWithDefaults.name ? ` name=${optsWithDefaults.name}` : ''}`,
    );
    const container = await this.docker.createContainer(createOptions);
    await container.start();
    const inspect = await container.inspect();
    this.logger.info(`Container started cid=${inspect.Id.substring(0, 12)} status=${inspect.State?.Status}`);
    // Persist workspace containers in registry
    if (this.registry) {
      try {
        const labels = inspect.Config?.Labels || {};
        if (labels['hautech.ai/role'] === 'workspace') {
          const combined = labels['hautech.ai/thread_id'] || '';
          const [nodeId, threadId] = combined.includes('__') ? combined.split('__', 2) : ['unknown', combined];
          await this.registry.registerStart({
            containerId: inspect.Id,
            nodeId,
            threadId,
            image: optsWithDefaults.image!,
            providerType: 'docker',
            labels,
            platform: optsWithDefaults.platform,
            ttlSeconds: optsWithDefaults.ttlSeconds,
          });
        }
      } catch (e) {
        this.logger.error('Failed to register container start', e);
      }
    }
    return new ContainerEntity(this, inspect.Id);
  }

  /** Execute a command inside a running container by its docker id. */
  async execContainer(
    containerId: string,
    command: string[] | string,
    options?: { workdir?: string; env?: Record<string, string> | string[]; timeoutMs?: number; idleTimeoutMs?: number; tty?: boolean; killOnTimeout?: boolean },
  ): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    const container = this.docker.getContainer(containerId);
    const inspectData = await container.inspect();
    if (inspectData.State?.Running !== true) {
      throw new Error(`Container '${containerId}' is not running`);
    }

    const Cmd = Array.isArray(command) ? command : ['/bin/sh', '-lc', command];
    const Env: string[] | undefined = Array.isArray(options?.env)
      ? options?.env
      : options?.env
        ? Object.entries(options.env).map(([k, v]) => `${k}=${v}`)
        : undefined;

    this.logger.debug(`Exec in container cid=${inspectData.Id.substring(0, 12)}: ${Cmd.join(' ')}`);
    // Update last-used before starting exec
    void this.touchLastUsed(inspectData.Id);
    const exec: Exec = await container.exec({
      Cmd,
      AttachStdout: true,
      AttachStderr: true,
      WorkingDir: options?.workdir,
      Env,
      Tty: options?.tty ?? false,
      AttachStdin: false,
    });

    try {
      const { stdout, stderr, exitCode } = await this.startAndCollectExec(exec, options?.timeoutMs, options?.idleTimeoutMs);
      this.logger.debug(
        `Exec finished cid=${inspectData.Id.substring(0, 12)} exitCode=${exitCode} stdoutBytes=${stdout.length} stderrBytes=${stderr.length}`,
      );
      return { stdout, stderr, exitCode };
    } catch (err: unknown) {
      const isTimeout = isExecTimeoutError(err) || isExecIdleTimeoutError(err);
      if (isTimeout && options?.killOnTimeout) {
        // Gracefully stop the container to ensure process-tree cleanup.
        try {
          this.logger.info('Exec timeout detected; stopping container', {
            containerId,
            timeoutMs: options?.timeoutMs,
            idleTimeoutMs: options?.idleTimeoutMs,
          });
          await this.stopContainer(containerId, 10);
        } catch (stopErr) {
          // Log but do not swallow original timeout error
          this.logger.error('Failed to stop container after exec timeout', { containerId, error: stopErr });
        }
      }
      throw err;
    }
  }

  /**
   * Open a long-lived interactive exec session (duplex) suitable for protocols like MCP over stdio.
   * Caller is responsible for closing the returned streams via close().
   */
  async openInteractiveExec(
    containerId: string,
    command: string[] | string,
    options?: { workdir?: string; env?: Record<string, string> | string[]; tty?: boolean; demuxStderr?: boolean },
  ): Promise<{
    stdin: NodeJS.WritableStream;
    stdout: NodeJS.ReadableStream;
    stderr?: NodeJS.ReadableStream;
    close: () => Promise<{ exitCode: number }>;
    execId: string;
  }> {
    const container = this.docker.getContainer(containerId);
    const inspectData = await container.inspect();
    if (inspectData.State?.Running !== true) {
      throw new Error(`Container '${containerId}' is not running`);
    }

    const Cmd = Array.isArray(command) ? command : ['/bin/sh', '-lc', command];
    const Env: string[] | undefined = Array.isArray(options?.env)
      ? options?.env
      : options?.env
        ? Object.entries(options.env).map(([k, v]) => `${k}=${v}`)
        : undefined;
    const tty = options?.tty ?? false; // Keep false for clean protocol framing
    const demux = options?.demuxStderr ?? true;

    this.logger.debug(
      `Interactive exec in container cid=${inspectData.Id.substring(0, 12)} tty=${tty} demux=${demux}: ${Cmd.join(' ')}`,
    );
    // Update last-used before starting interactive exec
    void this.touchLastUsed(inspectData.Id);

    const exec: Exec = await container.exec({
      Cmd,
      AttachStdout: true,
      AttachStderr: true,
      AttachStdin: true,
      WorkingDir: options?.workdir,
      Env,
      Tty: tty,
    });

    const stdoutStream = new (require('node:stream').PassThrough)();
    const stderrStream = new (require('node:stream').PassThrough)();

    const hijackStream: any = await new Promise((resolve, reject) => {
      exec.start({ hijack: true, stdin: true }, (err, stream) => {
        if (err) return reject(err);
        if (!stream) return reject(new Error('No stream returned from exec.start'));
        resolve(stream);
      });
    });

    if (!tty && demux) {
      this.docker.modem.demuxStream(hijackStream, stdoutStream, stderrStream);
    } else {
      hijackStream.pipe(stdoutStream);
    }

    const close = async (): Promise<{ exitCode: number }> => {
      try {
        hijackStream.end();
      } catch {}
      // Wait a short grace period; then inspect
      const details = await exec.inspect();
      return { exitCode: details.ExitCode ?? -1 };
    };

    const execDetails = await exec.inspect();
    return {
      stdin: hijackStream,
      stdout: stdoutStream,
      stderr: demux ? stderrStream : undefined,
      close,
      execId: execDetails.ID,
    };
  }

  private startAndCollectExec(
    exec: Exec,
    timeoutMs?: number,
    idleTimeoutMs?: number,
  ): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    return new Promise((resolve, reject) => {
      let stdout = '';
      let stderr = '';
      let finished = false;
      // Underlying hijacked stream reference, to destroy on timeouts
      let streamRef: NodeJS.ReadableStream | null = null;
      const clearAll = (...ts: (NodeJS.Timeout | null)[]) => ts.forEach((t) => t && clearTimeout(t));
      const execTimer = timeoutMs && timeoutMs > 0
        ? setTimeout(() => {
            if (finished) return;
            finished = true;
            // Ensure underlying stream is torn down to avoid further data/timers
            try { streamRef?.destroy?.(); } catch {}
            reject(new ExecTimeoutError(timeoutMs!, stdout, stderr));
          }, timeoutMs)
        : null;
      let idleTimer: NodeJS.Timeout | null = null;
      const armIdle = () => {
        if (finished) return; // do not arm after completion
        if (!idleTimeoutMs || idleTimeoutMs <= 0) return;
        if (idleTimer) clearTimeout(idleTimer);
        idleTimer = setTimeout(() => {
          if (finished) return;
          finished = true;
          // Ensure underlying stream is torn down to avoid further data/timers
          try { streamRef?.destroy?.(); } catch {}
          reject(new ExecIdleTimeoutError(idleTimeoutMs!, stdout, stderr));
        }, idleTimeoutMs);
      };

      exec.start({ hijack: true, stdin: false }, (err, stream) => {
        if (err) {
          clearAll(execTimer, idleTimer);
          return reject(err);
        }
        if (!stream) {
          clearAll(execTimer, idleTimer);
          return reject(new Error('No stream returned from exec.start'));
        }

        // If exec created without TTY, docker multiplexes stdout/stderr
        // capture stream for timeout teardown
        streamRef = stream;
        if (!exec.inspect) {
          // Very unlikely, but guard.
          this.logger.error('Exec instance missing inspect method');
        }

        // Try to determine if we should demux. We'll inspect later.
        (async () => {
          try {
            const details = await exec.inspect();
            const tty = details.ProcessConfig?.tty;
            armIdle();
            if (tty) {
              stream.on('data', (chunk: Buffer | string) => {
                if (finished) return;
                const text = chunk.toString();
                this.logger.debug(`[Exec stdout chunk]`, text.trim());
                stdout += text;
                armIdle();
              });
            } else {
              const { Writable } = require('node:stream') as typeof import('node:stream');
              const outStdout = new Writable({
                write: (chunk, _enc, cb) => {
                  if (!finished) {
                    const text = Buffer.isBuffer(chunk) ? chunk.toString() : String(chunk);
                    this.logger.debug(`[Exec stdout chunk]`, text.trim());
                    stdout += text;
                    armIdle();
                  }
                  cb();
                },
              });
              const outStderr = new Writable({
                write: (chunk, _enc, cb) => {
                  if (!finished) {
                    const text = Buffer.isBuffer(chunk) ? chunk.toString() : String(chunk);
                    this.logger.debug(`[Exec stderr chunk]`, text.trim());
                    stderr += text;
                    armIdle();
                  }
                  cb();
                },
              });
              this.docker.modem.demuxStream(stream, outStdout, outStderr);
            }
          } catch (e) {
            // Fallback: treat as single combined stream
            armIdle();
            stream.on('data', (c: Buffer | string) => {
              if (finished) return;
              stdout += c.toString();
              armIdle();
            });
          }
        })();

        stream.on('end', async () => {
          if (finished) return; // already timed out
          try {
            const inspectData = await exec.inspect();
            clearAll(execTimer, idleTimer);
            finished = true;
            resolve({ stdout, stderr, exitCode: inspectData.ExitCode ?? -1 });
          } catch (e) {
            clearAll(execTimer, idleTimer);
            finished = true;
            reject(e);
          }
        });
        stream.on('error', (e) => {
          if (finished) return;
          clearAll(execTimer, idleTimer);
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          finished = true;
          reject(e);
        });
        // Extra safety: clear timers on close as well
        stream.on('close', () => {
          clearAll(execTimer, idleTimer);
        });
      });
    });
  }

  /** Stop a container by docker id (gracefully). */
  async stopContainer(containerId: string, timeoutSec = 10): Promise<void> {
    this.logger.info(`Stopping container cid=${containerId.substring(0, 12)} (timeout=${timeoutSec}s)`);
    const c = this.docker.getContainer(containerId);
    try {
      await c.stop({ t: timeoutSec });
    } catch (e: any) {
      if (e?.statusCode === 304) {
        this.logger.debug(`Container already stopped cid=${containerId.substring(0, 12)}`);
      } else {
        throw e;
      }
    }
  }

  /** Remove a container by docker id. */
  async removeContainer(containerId: string, force = false): Promise<void> {
    this.logger.info(`Removing container cid=${containerId.substring(0, 12)} force=${force}`);
    const container = this.docker.getContainer(containerId);
    await container.remove({ force });
  }

  /** Inspect and return container labels */
  async getContainerLabels(containerId: string): Promise<Record<string, string> | undefined> {
    const container = this.docker.getContainer(containerId);
    const details = await container.inspect();
    return details.Config?.Labels ?? undefined;
  }

  /**
   * Find running (default) or all containers that match ALL provided labels.
   * Returns an array of ContainerEntity instances (may be empty).
   *
   * @param labels Key/value label pairs to match (logical AND)
   * @param options.all If true, include stopped containers as well
   */
  async findContainersByLabels(
    labels: Record<string, string>,
    options?: { all?: boolean },
  ): Promise<ContainerEntity[]> {
    const labelFilters = Object.entries(labels).map(([k, v]) => `${k}=${v}`);
    this.logger.info(`Listing containers by labels all=${options?.all ?? false} filters=${labelFilters.join(',')}`);
    // dockerode returns Docker.ContainerInfo[]; type explicitly for comparator safety
    const list: Docker.ContainerInfo[] = await this.docker.listContainers({
      all: options?.all ?? false,
      filters: { label: labelFilters },
    });
    // Deterministic ordering to stabilize selection; sort by Created then Id
    // Note: explicit Docker.ContainerInfo types avoid any in comparator.
    const sorted = [...list].sort((a: Docker.ContainerInfo, b: Docker.ContainerInfo) => {
      const ac = typeof a.Created === 'number' ? a.Created : 0;
      const bc = typeof b.Created === 'number' ? b.Created : 0;
      if (ac !== bc) return ac - bc; // ascending by Created
      const aid = String(a.Id ?? '');
      const bid = String(b.Id ?? '');
      return aid.localeCompare(bid);
    });
    return sorted.map((c) => new ContainerEntity(this, c.Id));
  }

  /**
   * Convenience wrapper returning the first container that matches all labels (or undefined).
   */
  async findContainerByLabels(
    labels: Record<string, string>,
    options?: { all?: boolean },
  ): Promise<ContainerEntity | undefined> {
    const containers = await this.findContainersByLabels(labels, options);
    return containers[0];
  }

  getDocker(): Docker {
    return this.docker;
  }
}

export interface ExecResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}
