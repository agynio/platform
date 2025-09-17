// src/logger.service.ts

export class LoggerService {
  info(message: string, ...optionalParams: any[]) {
    console.info(`[INFO] ${message}`, ...optionalParams);
  }

  debug(message: string, ...optionalParams: any[]) {
    console.debug(`[DEBUG] ${message}`, ...optionalParams);
  }

  error(message: string, ...optionalParams: any[]) {
    console.error(`[ERROR] ${message}`, ...optionalParams);
  }
}
