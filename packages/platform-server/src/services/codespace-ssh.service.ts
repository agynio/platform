import { spawn, ChildProcessWithoutNullStreams } from "child_process";
import { ConfigService } from "./config.service";
import { LoggerService } from "./logger.service";

interface RunResult {
  stdout: string;
  exitCode: number;
}

export class CodespaceSSHService {
  private proc?: ChildProcessWithoutNullStreams;
  private buffer = ""; // aggregate stdout
  private queue: Array<{
    sentinel: string;
    resolve: (r: RunResult) => void;
    reject: (e: any) => void;
    collected: string;
  }> = [];
  private sequence = 0;
  private closed = false;

  constructor(
    private config: ConfigService,
    private logger: LoggerService,
  ) {}

  connect(codespaceName: string) {
    const token = this.config.githubToken;
    // Spawn a persistent shell session inside the codespace.
    // We request a bare bash without user rc files for predictable output.
    this.proc = spawn("gh", ["codespace", "ssh", "-c", codespaceName, "--", "bash", "--noprofile", "--norc"], {
      env: { ...process.env, GH_TOKEN: token },
      stdio: "pipe",
    });

    this.proc.stdout.setEncoding("utf8");
    this.proc.stderr.setEncoding("utf8");

    this.proc.stdout.on("data", (chunk: string) => this.handleStdout(chunk));
    this.proc.stderr.on("data", (chunk: string) => {
      // stderr is merged into the current command's collected output to avoid losing context.
      if (this.queue.length) {
        this.queue[0].collected += chunk;
      } else {
        this.logger.error(`SSH(${codespaceName}) stray stderr:`, chunk);
      }
    });
    this.proc.on("close", (code) => {
      this.closed = true;
      while (this.queue.length) {
        const job = this.queue.shift();
        job?.reject(new Error(`SSH process closed (code ${code}) before command completed`));
      }
    });
    this.proc.on("error", (err) => {
      this.logger.error("SSH process error", err);
      while (this.queue.length) {
        const job = this.queue.shift();
        job?.reject(err);
      }
    });

    return this;
  }

  private handleStdout(chunk: string) {
    if (!this.queue.length) {
      // No pending command; ignore or log.
      return;
    }
    const job = this.queue[0];
    job.collected += chunk;

    // Check for sentinel line. Sentinel pattern: <sentinel> <exitCode>\n
    const sentinelIndex = job.collected.indexOf(job.sentinel);
    if (sentinelIndex === -1) return;

    // Extract everything before sentinel as stdout
    const afterSentinel = job.collected.substring(sentinelIndex + job.sentinel.length);
    // Expect: space + exitCode + newline (maybe with trailing data). We capture exit code digits.
    const match = afterSentinel.match(/^ (\d+).*$/s);
    if (!match) return; // wait for full line

    const exitCode = parseInt(match[1], 10);
    let stdout = job.collected.substring(0, sentinelIndex);

    // Clean trailing newlines from stdout
    stdout = stdout.replace(/\n+$/g, "\n");

    this.queue.shift();
    job.resolve({ stdout, exitCode });
  }

  async run(command: string, opts?: { timeoutMs?: number; acceptNonZero?: boolean }): Promise<RunResult> {
    if (!this.proc) throw new Error("SSH session not connected");
    if (this.closed) throw new Error("SSH session already closed");
    const seq = ++this.sequence;
    const sentinel = `__CMD_DONE_${seq}_${Math.random().toString(36).slice(2)}__`;
    return new Promise<RunResult>((resolve, reject) => {
      const timeout = opts?.timeoutMs
        ? setTimeout(() => {
            reject(new Error(`Timeout after ${opts.timeoutMs}ms for command: ${command}`));
          }, opts.timeoutMs)
        : null;

      this.queue.push({
        sentinel,
        resolve: (r) => {
          if (timeout) clearTimeout(timeout);
          if (r.exitCode !== 0 && !opts?.acceptNonZero) {
            reject(new Error(`Exit code ${r.exitCode} for command: ${command}\nOutput:\n${r.stdout}`));
            return;
          }
          resolve(r);
        },
        reject: (e) => {
          if (timeout) clearTimeout(timeout);
          reject(e);
        },
        collected: "",
      });

      const compound = `${command}; echo ${sentinel} $?`;
      this.proc!.stdin.write(compound + "\n");
    });
  }

  close() {
    if (this.closed || !this.proc) return;
    this.proc.stdin.end("exit\n");
    this.closed = true;
  }
}
