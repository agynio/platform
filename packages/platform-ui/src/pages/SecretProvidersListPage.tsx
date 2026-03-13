import { EntityListPage } from './entities/EntityListPage';

export function SecretProvidersListPage() {
  return (
    <EntityListPage
      kind="secret_provider"
      title="Secret Providers"
      description="Manage integrations for external secret stores."
      listPath="/secret-providers"
      createLabel="New secret provider"
      emptyLabel="No secret providers available."
    />
  );
}
