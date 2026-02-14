import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, RefreshCw } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { EntityTable } from '@/components/entities/EntityTable';
import { EntityFormDialog } from '@/components/entities/EntityFormDialog';
import { useGraphEntities } from '@/features/entities/hooks/useGraphEntities';
import { getTemplateOptions, toConnectionList } from '@/features/entities/api/graphEntities';
import type { GraphEntityKind, GraphEntitySummary } from '@/features/entities/types';

interface ToolbarAction {
  label: string;
  to: string;
}

interface EntityListPageProps {
  kind: GraphEntityKind;
  title: string;
  description: string;
  createLabel: string;
  emptyLabel: string;
  toolbarActions?: ToolbarAction[];
}

export function EntityListPage({ kind, title, description, createLabel, emptyLabel, toolbarActions = [] }: EntityListPageProps) {
  const { entities, createEntity, updateEntity, deleteEntity, graphQuery, templatesQuery, conflict, resolveConflict, isSaving } = useGraphEntities();
  const [search, setSearch] = useState('');
  const [dialogMode, setDialogMode] = useState<'create' | 'edit' | null>(null);
  const [activeEntity, setActiveEntity] = useState<GraphEntitySummary | undefined>();

  const templates = useMemo(() => getTemplateOptions(templatesQuery.data ?? [], kind), [kind, templatesQuery.data]);
  const connections = useMemo(() => toConnectionList(graphQuery.data?.edges), [graphQuery.data?.edges]);

  const filteredEntities = useMemo(() => {
    const query = search.trim().toLowerCase();
    return entities.filter((entity) => {
      if (entity.templateKind !== kind) return false;
      if (!query) return true;
      const haystack = [entity.title, entity.id, entity.templateTitle, entity.templateName]
        .concat(typeof entity.config.description === 'string' ? [entity.config.description] : [])
        .join(' ')
        .toLowerCase();
      return haystack.includes(query);
    });
  }, [entities, kind, search]);

  const isLoading = graphQuery.isLoading || templatesQuery.isLoading;
  const dialogOpen = dialogMode !== null;

  const handleCreateClick = () => {
    setActiveEntity(undefined);
    setDialogMode('create');
  };

  const handleEditClick = (entity: GraphEntitySummary) => {
    setActiveEntity(entity);
    setDialogMode('edit');
  };

  const handleDeleteClick = async (entity: GraphEntitySummary) => {
    const confirmed = window.confirm(`Delete ${entity.title}? This action cannot be undone.`);
    if (!confirmed) return;
    await deleteEntity({ id: entity.id });
  };

  const closeDialog = () => {
    setDialogMode(null);
    setActiveEntity(undefined);
  };

  const dialogModeForSubmit = dialogMode ?? 'create';
  const dialogSubmit = dialogMode === 'edit' ? updateEntity : createEntity;

  const showEmptyLabel = search ? `No ${title.toLowerCase()} match “${search}”.` : emptyLabel;
  const disableCreate = templates.length === 0 || isSaving || templatesQuery.isLoading;

  return (
    <div className="flex h-full flex-col gap-6">
      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">{title}</h1>
            <p className="text-sm text-muted-foreground">{description}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {toolbarActions.map((action) => (
              <Button key={action.to} asChild variant="outline" size="sm">
                <Link to={action.to}>{action.label}</Link>
              </Button>
            ))}
            <Button onClick={handleCreateClick} disabled={disableCreate}>
              <Plus className="mr-2 h-4 w-4" /> {createLabel}
            </Button>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Input
            placeholder={`Search ${title.toLowerCase()}`}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="max-w-sm"
          />
          <Button variant="outline" size="sm" onClick={() => setSearch('')} disabled={!search}>
            Clear
          </Button>
        </div>
      </div>

      {conflict && (
        <Alert className="border-amber-400/70 bg-amber-50 text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-100">
          <AlertTitle>Graph updated elsewhere</AlertTitle>
          <AlertDescription className="flex items-center justify-between gap-3">
            <span>Latest graph changes are available. Refresh to continue editing.</span>
            <Button size="sm" variant="outline" onClick={() => resolveConflict()}>
              <RefreshCw className="mr-2 h-4 w-4" /> Refresh graph
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {(graphQuery.isError || templatesQuery.isError) && (
        <Alert variant="destructive">
          <AlertTitle>Unable to load graph data</AlertTitle>
          <AlertDescription>Check your connection and try again.</AlertDescription>
        </Alert>
      )}

      <EntityTable
        rows={filteredEntities}
        isLoading={isLoading}
        emptyLabel={showEmptyLabel}
        onEdit={handleEditClick}
        onDelete={handleDeleteClick}
      />

      <EntityFormDialog
        open={dialogOpen}
        mode={dialogModeForSubmit}
        kind={kind}
        entity={dialogMode === 'edit' ? activeEntity : undefined}
        templates={templates}
        allNodes={entities}
        connections={connections}
        isSubmitting={isSaving}
        onOpenChange={(open) => {
          if (!open) {
            closeDialog();
          } else if (!dialogMode) {
            setDialogMode('create');
          }
        }}
        onSubmit={dialogSubmit}
      />
    </div>
  );
}
