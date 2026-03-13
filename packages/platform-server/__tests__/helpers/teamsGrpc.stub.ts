import type { Agent } from '../../src/proto/gen/agynio/api/teams/v1/teams_pb';
import type { TeamsGrpcClient } from '../../src/teams/teamsGrpc.client';

type TeamsClientStubOptions = {
  agents?: Agent[];
  listAgents?: TeamsGrpcClient['listAgents'];
};

export const createTeamsClientStub = (options?: TeamsClientStubOptions): TeamsGrpcClient => {
  if (options?.listAgents) {
    return { listAgents: options.listAgents } as unknown as TeamsGrpcClient;
  }

  const agents = options?.agents ?? [];
  return {
    listAgents: async () => ({
      items: agents,
      page: 1,
      perPage: Math.max(agents.length, 1),
      total: BigInt(agents.length),
    }),
  } as unknown as TeamsGrpcClient;
};
