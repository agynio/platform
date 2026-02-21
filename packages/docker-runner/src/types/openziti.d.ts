declare module '@openziti/ziti-sdk-nodejs' {
  import type { Express } from 'express';

  export function init(identityPath: string): Promise<number>;
  export function httpAgent(): unknown;
  export function enroll(jwtPath: string): Promise<unknown>;
  export function express(appFactory: typeof import('express'), serviceName: string): Express;
}

declare module '@openziti/ziti-sdk-nodejs/lib/express-listener.js' {
  export class Server {
    prototype: {
      listen: (...args: unknown[]) => unknown;
    };
  }
}
