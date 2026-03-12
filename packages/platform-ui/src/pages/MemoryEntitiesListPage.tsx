import { EntityListPage } from './entities/EntityListPage';
import { INCLUDED_MEMORY_TEMPLATES } from '@/features/entities/api/teamEntities';

export function MemoryEntitiesListPage() {
  return (
    <EntityListPage
      kind="memory"
      title="Memory"
      description="Manage memory buckets available to agents."
      listPath="/memory"
      createLabel="New memory bucket"
      emptyLabel="No memory buckets configured yet."
      templateIncludeNames={INCLUDED_MEMORY_TEMPLATES}
    />
  );
}
