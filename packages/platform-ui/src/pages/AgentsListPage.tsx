import { EntityListPage } from './entities/EntityListPage';

export function AgentsListPage() {
  return (
    <EntityListPage
      kind="agent"
      title="Agents"
      description="Manage all agent templates available in your workspace."
      createLabel="New agent"
      emptyLabel="No agents found. Use the button above to create one."
      toolbarActions={[{ label: 'Open graph', to: '/agents/graph' }]}
    />
  );
}
