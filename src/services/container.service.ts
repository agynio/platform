import Docker, { ContainerCreateOptions, Exec } from "dockerode";
import { ContainerEntity } from "../entities/container.entity";
import { LoggerService } from "./logger.service";

const DEFAULT_IMAGE = "mcr.microsoft.com/vscode/devcontainers/base";

export type ContainerOpts = {
  image?: string;
  name?: string;
  cmd?: string[];
  env?: Record<string, string> | string[];
  workingDir?: string;
  autoRemove?: boolean; // --rm behavior
  binds?: string[]; // hostPath:containerPath[:ro]
  networkMode?: string;
  tty?: boolean;
  labels?: Record<string, string>;
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

  constructor(private logger: LoggerService) {
    this.docker = new Docker();
  }

  /** Pull an image if it's not already present locally. */
  async ensureImage(image: string): Promise<void> {
    this.logger.info(`Ensuring image '${image}' is available locally`);
    // Check if image exists
    try {
      await this.docker.getImage(image).inspect();
      this.logger.debug(`Image '${image}' already present`);
      return;
    } catch {
      this.logger.info(`Image '${image}' not found locally. Pulling...`);
    }

    await new Promise<void>((resolve, reject) => {
      this.docker.pull(image, (err: Error | undefined, stream: NodeJS.ReadableStream | undefined) => {
        if (err) return reject(err);
        if (!stream) return reject(new Error("No pull stream returned"));
        this.docker.modem.followProgress(
          stream as NodeJS.ReadableStream,
          (doneErr: any) => {
            if (doneErr) return reject(doneErr);
            this.logger.info(`Finished pulling image '${image}'`);
            resolve();
          },
          (event: any) => {
            if (event?.status && event?.id) {
              this.logger.debug(`${event.id}: ${event.status}`);
            } else if (event?.status) {
              this.logger.debug(event.status);
            }
          },
        );
      });
    });
  }

  /**
   * Start a new container and return a ContainerEntity representing it.
   */
  async start(opts?: ContainerOpts): Promise<ContainerEntity> {
    const optsWithDefaults = { image: DEFAULT_IMAGE, autoRemove: true, ...(opts ?? {}) };
    await this.ensureImage(optsWithDefaults.image!);

    const Env: string[] | undefined = Array.isArray(optsWithDefaults.env)
      ? optsWithDefaults.env
      : optsWithDefaults.env
        ? Object.entries(optsWithDefaults.env).map(([k, v]) => `${k}=${v}`)
        : undefined;

    const createOptions: ContainerCreateOptions = {
      Image: optsWithDefaults.image,
      name: optsWithDefaults.name,
      Cmd: optsWithDefaults.cmd,
      Env,
      WorkingDir: optsWithDefaults.workingDir,
      HostConfig: {
        AutoRemove: optsWithDefaults.autoRemove ?? false,
        Binds: optsWithDefaults.binds,
        NetworkMode: optsWithDefaults.networkMode,
      },
      Tty: optsWithDefaults.tty ?? false,
      AttachStdout: true,
      AttachStderr: true,
      Labels: optsWithDefaults.labels,
    };

    this.logger.info(
      `Creating container from '${optsWithDefaults.image}'${optsWithDefaults.name ? ` name=${optsWithDefaults.name}` : ""}`,
    );
    const container = await this.docker.createContainer(createOptions);
    await container.start();
    const inspect = await container.inspect();
    this.logger.info(`Container started cid=${inspect.Id.substring(0, 12)} status=${inspect.State?.Status}`);
    return new ContainerEntity(this, inspect.Id);
  }

  /** Execute a command inside a running container by its docker id. */
  async execContainer(
    containerId: string,
    command: string[] | string,
    options?: { workdir?: string; env?: Record<string, string> | string[]; timeoutMs?: number; tty?: boolean },
  ): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    const container = this.docker.getContainer(containerId);
    const inspectData = await container.inspect();
    if (inspectData.State?.Running !== true) {
      throw new Error(`Container '${containerId}' is not running`);
    }

    const Cmd = Array.isArray(command) ? command : ["/bin/sh", "-lc", command];
    const Env: string[] | undefined = Array.isArray(options?.env)
      ? options?.env
      : options?.env
        ? Object.entries(options.env).map(([k, v]) => `${k}=${v}`)
        : undefined;

    this.logger.debug(`Exec in container cid=${inspectData.Id.substring(0, 12)}: ${Cmd.join(" ")}`);
    const exec: Exec = await container.exec({
      Cmd,
      AttachStdout: true,
      AttachStderr: true,
      WorkingDir: options?.workdir,
      Env,
      Tty: options?.tty ?? false,
    });

    const { stdout, stderr, exitCode } = await this.startAndCollectExec(exec, options?.timeoutMs);
    this.logger.debug(
      `Exec finished cid=${inspectData.Id.substring(0, 12)} exitCode=${exitCode} stdoutBytes=${stdout.length} stderrBytes=${stderr.length}`,
    );
    return { stdout, stderr, exitCode };
  }

  private startAndCollectExec(
    exec: Exec,
    timeoutMs?: number,
  ): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    return new Promise((resolve, reject) => {
      let stdout = "";
      let stderr = "";
      let finished = false;
      const timer = timeoutMs
        ? setTimeout(() => {
            finished = true;
            reject(new Error(`Exec timed out after ${timeoutMs}ms`));
          }, timeoutMs)
        : null;

      exec.start({ hijack: true, stdin: false }, (err, stream) => {
        if (err) {
          if (timer) clearTimeout(timer);
          return reject(err);
        }
        if (!stream) {
          if (timer) clearTimeout(timer);
          return reject(new Error("No stream returned from exec.start"));
        }

        // If exec created without TTY, docker multiplexes stdout/stderr
        if (!exec.inspect) {
          // Very unlikely, but guard.
          this.logger.error("Exec instance missing inspect method");
        }

        // Try to determine if we should demux. We'll inspect later.
        (async () => {
          try {
            const details = await exec.inspect();
            const tty = details.ProcessConfig?.tty;
            if (tty) {
              stream.on("data", (chunk: Buffer | string) => {
                stdout += chunk.toString();
              });
            } else {
              this.docker.modem.demuxStream(
                stream,
                {
                  write: (chunk: any) => {
                    stdout += Buffer.isBuffer(chunk) ? chunk.toString() : chunk;
                  },
                } as any,
                {
                  write: (chunk: any) => {
                    stderr += Buffer.isBuffer(chunk) ? chunk.toString() : chunk;
                  },
                } as any,
              );
            }
          } catch (e) {
            // Fallback: treat as single combined stream
            stream.on("data", (c: Buffer | string) => (stdout += c.toString()));
          }
        })();

        stream.on("end", async () => {
          if (finished) return; // already timed out
          try {
            const inspectData = await exec.inspect();
            if (timer) clearTimeout(timer);
            finished = true;
            resolve({ stdout, stderr, exitCode: inspectData.ExitCode ?? -1 });
          } catch (e) {
            if (timer) clearTimeout(timer);
            finished = true;
            reject(e);
          }
        });
        stream.on("error", (e) => {
          if (finished) return;
          if (timer) clearTimeout(timer);
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          finished = true;
          reject(e);
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
    this.logger.info(`Listing containers by labels all=${options?.all ?? false} filters=${labelFilters.join(",")}`);
    const list = await this.docker.listContainers({
      all: options?.all ?? false,
      filters: { label: labelFilters },
    });
    return list.map((c) => new ContainerEntity(this, c.Id));
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
