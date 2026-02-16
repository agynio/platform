import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, RefreshCw } from 'lucide-react';
import { Input } from '@/components/Input';
import { Button } from '@/components/Button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { EntityTable, type EntityTableSortKey, type EntityTableSortState } from '@/components/entities/EntityTable';
import { EntityFormDialog } from '@/components/entities/EntityFormDialog';
import { useGraphEntities } from '@/features/entities/hooks/useGraphEntities';
import { getTemplateOptions } from '@/features/entities/api/graphEntities';
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
  const [sort, setSort] = useState<EntityTableSortState>({ key: 'title', direction: 'asc' });

  const templates = useMemo(() => getTemplateOptions(templatesQuery.data ?? [], kind), [kind, templatesQuery.data]);

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

  const sortedEntities = useMemo(() => {
    if (filteredEntities.length === 0) return filteredEntities;
    const collator = new Intl.Collator(undefined, { sensitivity: 'base', numeric: true });
    return [...filteredEntities].sort((a, b) => {
      const aValue = sort.key === 'title' ? a.title : a.templateTitle ?? a.templateName;
      const bValue = sort.key === 'title' ? b.title : b.templateTitle ?? b.templateName;
      const result = collator.compare(aValue, bValue);
      return sort.direction === 'asc' ? result : -result;
    });
  }, [filteredEntities, sort]);

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

  const handleSortChange = (key: EntityTableSortKey) => {
    setSort((current) => {
      if (current.key === key) {
        return { key, direction: current.direction === 'asc' ? 'desc' : 'asc' };
      }
      return { key, direction: 'asc' };
    });
  };

  return (
    <div className="flex h-full flex-col overflow-hidden bg-white">
      <div className="border-b border-[var(--agyn-border-subtle)] px-6 py-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold text-[var(--agyn-dark)]">{title}</h1>
            <p className="text-sm text-[var(--agyn-text-subtle)] mt-1">{description}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {toolbarActions.map((action) => (
              <Button key={action.to} asChild variant="outline" size="sm">
                <Link to={action.to}>{action.label}</Link>
              </Button>
            ))}
            <Button onClick={handleCreateClick} disabled={disableCreate} size="sm">
              <Plus className="mr-2 h-4 w-4" /> {createLabel}
            </Button>
          </div>
        </div>
      </div>

      <div className="border-b border-[var(--agyn-border-subtle)] px-6 py-3">
        <div className="flex flex-wrap items-center gap-3">
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

      <div className="flex-1 overflow-auto">
        <div className="px-6 py-6 space-y-4">
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
            rows={sortedEntities}
            isLoading={isLoading}
            emptyLabel={showEmptyLabel}
            onEdit={handleEditClick}
            onDelete={handleDeleteClick}
            sort={sort}
            onSortChange={handleSortChange}
          />
        </div>
      </div>

      <EntityFormDialog
        open={dialogOpen}
        mode={dialogModeForSubmit}
        kind={kind}
        entity={dialogMode === 'edit' ? activeEntity : undefined}
        templates={templates}
        isSubmitting={isSaving}
        onOpenChange={(openState) => {
          if (!openState) {
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
