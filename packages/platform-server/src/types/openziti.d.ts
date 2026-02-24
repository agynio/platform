declare module '@openziti/ziti-sdk-nodejs' {
  export function init(identityPath: string): Promise<number>;
  export function httpAgent(): unknown;
  export function enroll(jwtPath: string): Promise<unknown>;
}
