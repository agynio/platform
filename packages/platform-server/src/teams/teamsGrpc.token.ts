import type { TeamsGrpcClient } from './teamsGrpc.client';

export const TEAMS_GRPC_CLIENT = Symbol('TEAMS_GRPC_CLIENT');

export type TeamsClient = TeamsGrpcClient;
