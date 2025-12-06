import { useMemo } from 'react';

import { GraphLayout } from '@/components/agents/GraphLayout';
import { graphApiService } from '@/features/graph/services/api';
import { listVariables } from '@/features/variables/api';

export function AgentsGraphContainer() {
  const services = useMemo(() => ({
    searchNixPackages: graphApiService.searchNixPackages,
    listNixPackageVersions: graphApiService.listNixPackageVersions,
    resolveNixSelection: graphApiService.resolveNixSelection,
    listVariableKeys: async () => {
      try {
        const variables = await listVariables();
        return variables
          .map((item) => item?.key)
          .filter((key): key is string => typeof key === 'string' && key.length > 0);
      } catch {
        return [];
      }
    },
  }), []);

  return <GraphLayout services={services} />;
}
