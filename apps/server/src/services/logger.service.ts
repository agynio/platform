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
    this.obs()?.info(`${message}\n${this.serialize(optionalParams)}`);
  }

  debug(message: string, ...optionalParams: any[]) {
    console.debug(`[DEBUG] ${message}`, ...optionalParams);
    this.obs()?.debug(`${message}\n${this.serialize(optionalParams)}`);
  }

  error(message: string, ...optionalParams: any[]) {
    console.error(`[ERROR] ${message}`, ...optionalParams);
    this.obs()?.error(`${message}\n${this.serialize(optionalParams)}`);
  }

  private serialize(params: any[]) {
    return JSON.stringify(params);
  }
}
