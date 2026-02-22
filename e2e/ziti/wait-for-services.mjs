import { setTimeout as delay } from 'node:timers/promises';

export async function waitForServices({ compose, inspect, services, timeoutMs }) {
  const pending = new Map(services.map((service) => [service.name, service]));
  const deadline = Date.now() + timeoutMs;

  while (pending.size > 0 && Date.now() < deadline) {
    for (const [name, service] of pending) {
      const status = await readServiceStatus(compose, inspect, name);
      if (!status) {
        continue;
      }
      if (isServiceReady(service, status)) {
        console.log(`[ziti-e2e] service ${name} ready (${status.message})`);
        pending.delete(name);
      } else {
        console.log(`[ziti-e2e] waiting for ${name} (${status.message})`);
      }
    }

    if (pending.size === 0) {
      break;
    }

    await delay(2_000, { ref: false });
  }

  if (pending.size > 0) {
    const details = [];
    for (const [name] of pending) {
      const status = await readServiceStatus(compose, inspect, name);
      details.push(`${name}:${status?.message ?? 'unavailable'}`);
    }
    throw new Error(`Timeout waiting for services: ${details.join(', ')}`);
  }
}

async function readServiceStatus(compose, inspect, serviceName) {
  try {
    const { stdout: idStdout } = await compose(['ps', '-q', serviceName], { quiet: true });
    const containerId = idStdout.trim();
    if (!containerId) {
      return undefined;
    }
    const { stdout } = await inspect(containerId);
    const parsed = JSON.parse(stdout)?.[0];
    if (!parsed?.State) {
      return undefined;
    }
    return {
      containerId,
      status: parsed.State.Status,
      health: parsed.State.Health?.Status,
      exitCode: parsed.State.ExitCode,
      message: buildStatusMessage(parsed.State),
    };
  } catch (error) {
    console.warn(`[ziti-e2e] failed to read status for ${serviceName}`, error);
    return undefined;
  }
}

function isServiceReady(service, status) {
  if (service.completed) {
    return status.status === 'exited' && status.exitCode === 0;
  }
  if (service.requireHealth) {
    return status.health === 'healthy';
  }
  return status.status === 'running';
}

function buildStatusMessage(state) {
  if (state.Health?.Status) {
    return `${state.Status} / health=${state.Health.Status}`;
  }
  if (state.Status === 'exited') {
    return `${state.Status} (code=${state.ExitCode})`;
  }
  return state.Status ?? 'unknown';
}
