import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import React from 'react';

// Zod schemas mirroring server view
const variableViewItemSchema = z.object({
  key: z.string(),
  source: z.enum(['vault', 'graph', 'local']),
  value: z.string().optional(),
  vaultRef: z.string().optional(),
});
const variablesListSchema = z.array(variableViewItemSchema);

async function fetchVariables(graphName: string): Promise<z.infer<typeof variablesListSchema>> {
  const res = await fetch(`/api/graphs/${encodeURIComponent(graphName)}/variables`);
  const data: unknown = await res.json();
  const parsed = variablesListSchema.safeParse(data);
  if (!parsed.success) throw new Error('Invalid server response');
  return parsed.data;
}

export function SettingsVariables() {
  const graphName = 'main';
  const q = useQuery({ queryKey: ['variables', graphName], queryFn: () => fetchVariables(graphName) });
  return (
    <div className="p-4">
      <h1 className="mb-4 text-xl font-semibold tracking-tight">Variables</h1>
      {q.isLoading && <div>Loading…</div>}
      {q.error && <div>Error loading variables</div>}
      {q.data && (
        <table className="min-w-full text-sm">
          <thead>
            <tr>
              <th className="text-left p-2">Key</th>
              <th className="text-left p-2">Source</th>
              <th className="text-left p-2">Value</th>
            </tr>
          </thead>
          <tbody>
            {q.data.map((v) => (
              <tr key={v.key}>
                <td className="p-2">{v.key}</td>
                <td className="p-2">{v.source}</td>
                <td className="p-2">{v.source === 'vault' ? v.vaultRef ?? '' : v.value ?? ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

export default SettingsVariables;

