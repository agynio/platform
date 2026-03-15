import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { EntityTable, type EntityTableSortKey, type EntityTableSortState } from '@/components/entities/EntityTable';
import { useTeamEntities } from '@/features/entities/hooks/useTeamEntities';
import { getTemplateOptions } from '@/features/entities/api/teamEntities';
import type { GraphEntityKind, GraphEntitySummary } from '@/features/entities/types';

interface ToolbarAction {
  label: string;
  to: string;
}

interface EntityListPageProps {
  kind: GraphEntityKind;
  title: string;
  description: string;
  listPath: string;
  createLabel: string;
  emptyLabel: string;
  toolbarActions?: ToolbarAction[];
  templateIncludeNames?: ReadonlySet<string>;
  templateExcludeNames?: ReadonlySet<string>;
}

export function EntityListPage({
  kind,
  title,
  description,
  listPath,
  createLabel,
  emptyLabel,
  toolbarActions = [],
  templateIncludeNames,
  templateExcludeNames,
}: EntityListPageProps) {
  const navigate = useNavigate();
  const { entities, deleteEntity, templatesQuery, isSaving, isLoading, hasError } = useTeamEntities();
  const [sort, setSort] = useState<EntityTableSortState>({ key: 'title', direction: 'asc' });

  const templates = useMemo(() => {
    const options = getTemplateOptions(templatesQuery.data ?? [], kind, templateExcludeNames);
    if (!templateIncludeNames || templateIncludeNames.size === 0) {
      return options;
    }
    return options.filter((option) => templateIncludeNames.has(option.name));
  }, [kind, templateExcludeNames, templateIncludeNames, templatesQuery.data]);

  const filteredEntities = useMemo(() => {
    return entities.filter((entity) => {
      if (entity.entityKind !== kind) {
        return false;
      }
      if (templateIncludeNames && templateIncludeNames.size > 0 && !templateIncludeNames.has(entity.templateName)) {
        return false;
      }
      if (templateExcludeNames && templateExcludeNames.has(entity.templateName)) {
        return false;
      }
      return true;
    });
  }, [entities, kind, templateIncludeNames, templateExcludeNames]);

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

  const handleCreateClick = () => {
    navigate(`${listPath}/new`);
  };

  const handleEditClick = (entity: GraphEntitySummary) => {
    navigate(`${listPath}/${entity.id}/edit`);
  };

  const handleDeleteClick = async (entity: GraphEntitySummary) => {
    const confirmed = window.confirm(`Delete ${entity.title}? This action cannot be undone.`);
    if (!confirmed) return;
    await deleteEntity({ id: entity.id, entityKind: entity.entityKind });
  };

  const showEmptyLabel = emptyLabel;
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
      <div className="border-b border-[var(--agyn-border-subtle)] px-6 py-4 bg-white">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold text-[var(--agyn-dark)]">{title}</h1>
            <p className="text-sm text-[var(--agyn-text-subtle)] mt-1">{description}</p>
          </div>
          <div className="flex items-center gap-2">
            {toolbarActions.map((action) => (
              <Link
                key={action.to}
                to={action.to}
                className="inline-flex items-center rounded-md border border-[var(--agyn-border-subtle)] px-3 py-2 text-sm font-medium text-[var(--agyn-dark)] hover:bg-[var(--agyn-bg-light)] transition-colors"
              >
                {action.label}
              </Link>
            ))}
            <button
              type="button"
              onClick={handleCreateClick}
              disabled={disableCreate}
              className="flex items-center gap-2 px-4 py-2 bg-[var(--agyn-blue)] text-white rounded-md hover:bg-[var(--agyn-blue)]/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm"
            >
              <Plus className="w-4 h-4" />
              {createLabel}
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 flex flex-col overflow-hidden">
        {(hasError || templatesQuery.isError) && (
          <div className="shrink-0 space-y-4 border-b border-[var(--agyn-border-subtle)] px-6 py-4">
            <Alert variant="destructive">
              <AlertTitle>Unable to load entities</AlertTitle>
              <AlertDescription>Check your connection and try again.</AlertDescription>
            </Alert>
          </div>
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
  );
}
