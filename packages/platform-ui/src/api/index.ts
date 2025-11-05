export * as client from './client';
import { graph } from './graph';
import * as tracing from './tracing';
import * as nix from './nix';
export { graph } from './graph';
export { tracing, nix };

export const api = { graph, tracing, nix };
