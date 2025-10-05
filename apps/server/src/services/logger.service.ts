// src/logger.service.ts

import { logger as obsLogger } from '@hautech/obs-sdk';

export class LoggerService {
  private obs() {
    // Obtain contextual logger (bound to active span if any)
    try {
      return obsLogger();
    } catch {
      // SDK not initialized yet
      return null;
    }
  }

  info(message: string, ...optionalParams: any[]) {
    console.info(`[INFO] ${message}`, ...optionalParams);
    this.obs()?.info(message, this.serialize(optionalParams));
  }

  debug(message: string, ...optionalParams: any[]) {
    console.debug(`[DEBUG] ${message}`, ...optionalParams);
    this.obs()?.debug(message, this.serialize(optionalParams));
  }

  error(message: string, ...optionalParams: any[]) {
    console.error(`[ERROR] ${message}`, ...optionalParams);
    this.obs()?.error(message, this.serialize(optionalParams));
  }

  private serialize(params: any[]): Record<string, unknown> | undefined {
    if (!params || params.length === 0) return undefined;
    if (params.length === 1 && typeof params[0] === 'object') return params[0];
    return { params: params.map((p) => (typeof p === 'object' ? safeJson(p) : p)) };
  }
}

function safeJson(obj: any) {
  try {
    return JSON.parse(JSON.stringify(obj));
  } catch {
    return String(obj);
  }
}
