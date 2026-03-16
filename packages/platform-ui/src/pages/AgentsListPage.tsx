import { EntityListPage } from './entities/EntityListPage';

export function AgentsListPage() {
  return (
    <EntityListPage
      kind="agent"
      title="Agents"
      description="Manage agents available to your team."
      listPath="/agents"
      createLabel="New agent"
      emptyLabel="No agents found. Use the button above to create one."
    />
  );
}
