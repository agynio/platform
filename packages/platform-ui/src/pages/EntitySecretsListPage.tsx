import { EntityListPage } from './entities/EntityListPage';

export function EntitySecretsListPage() {
  return (
    <EntityListPage
      kind="secret"
      title="Secrets"
      description="Define secret entries sourced from providers."
      listPath="/entity-secrets"
      createLabel="New secret"
      emptyLabel="No secrets available."
    />
  );
}
