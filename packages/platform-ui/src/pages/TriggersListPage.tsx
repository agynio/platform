import { EntityListPage } from './entities/EntityListPage';

export function TriggersListPage() {
  return (
    <EntityListPage
      kind="trigger"
      title="Triggers"
      description="Review and configure trigger entry points."
      listPath="/triggers"
      createLabel="New trigger"
      emptyLabel="No triggers defined yet."
    />
  );
}
